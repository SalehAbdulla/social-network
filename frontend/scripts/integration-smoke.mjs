import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.BASE_URL || 'http://localhost:4000';
const taskDir = process.env.TEST_ARTIFACT_DIR || path.resolve('../backend/tmp/browser-check');
await mkdir(taskDir, { recursive: true });
const browserProfile = path.join(taskDir, `profile-${Date.now()}`);
await mkdir(browserProfile);
const chrome = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${browserProfile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let port;
for (let i = 0; i < 100; i++) {
  if (browser.exitCode !== null) throw new Error(`Browser exited: ${browser.exitCode}`);
  try { port = (await readFile(path.join(browserProfile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]; break; } catch { await pause(100); }
}
assert(port, 'Browser debugging port did not become ready');
const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const socket = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
let sequence = 0;
const pending = new Map();
const exceptions = [];
const exceptionDetails = [];
const failedResponses = [];
let holdGroupRefresh = false;
const heldGroupRequests = [];
socket.addEventListener('message', async ({ data }) => {
  const event = JSON.parse(String(data));
  if (event.id) {
    const entry = pending.get(event.id); if (!entry) return;
    pending.delete(event.id); clearTimeout(entry.timer);
    if (event.error) entry.reject(new Error(JSON.stringify(event.error))); else entry.resolve(event.result);
  }
  if (event.method === 'Runtime.exceptionThrown') {
    const detail = event.params.exceptionDetails;
    exceptions.push(detail.text + ': ' + (detail.exception?.description || ''));
    exceptionDetails.push(detail);
    if (detail.exception?.objectId) {
      try {
        const inspected = await command('Runtime.callFunctionOn', { objectId: detail.exception.objectId, functionDeclaration: 'function() { return { type: this.type, target: this.target?.tagName, src: this.target?.src, href: this.target?.href, url: this.target?.url, stack: this.stack }; }', returnByValue: true }, event.sessionId);
        detail.event = inspected.result.value;
      } catch { /* Navigation can discard the exception object. */ }
    }
  }
  if (event.method === 'Network.responseReceived' && event.params.response.status >= 400 && event.params.response.url.startsWith(base)) {
    failedResponses.push({ url: event.params.response.url, status: event.params.response.status });
  }
  if (event.method === 'Fetch.requestPaused') {
    // Use the system font offline without making the stylesheet loader reject.
    if (new URL(event.params.request.url).hostname === 'fonts.googleapis.com') {
      await command('Fetch.fulfillRequest', { requestId: event.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/css' }], body: '' }, event.sessionId);
      return;
    }
    if (holdGroupRefresh && event.params.request.method === 'GET' && new URL(event.params.request.url).pathname === '/api/v1/groups') {
      heldGroupRequests.push(event); return;
    }
    const local = event.params.request.url.startsWith(base + '/') || event.params.request.url.startsWith('data:') || event.params.request.url.startsWith('blob:');
    try { await command(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId: event.params.requestId } : { requestId: event.params.requestId, errorReason: 'BlockedByClient' }, event.sessionId); } catch { /* A page may close with a request pending. */ }
  }
});
function command(method, params = {}, sessionId) {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timed out: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ id, method, params, sessionId }));
  });
}
async function evaluate(page, expression) {
  const result = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, page);
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}
async function until(page, expression, label, timeout = 60000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await evaluate(page, expression)) return;
    await pause(250);
  }
  throw new Error(`Timed out: ${label}\n${await evaluate(page, 'location.href + "\\n" + document.body.innerText')}\n${JSON.stringify(failedResponses.slice(-10))}`);
}
async function createPage(email = 'dummy@example.com') {
  const { browserContextId } = await command('Target.createBrowserContext');
  const { targetId } = await command('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  await command('Runtime.enable', {}, sessionId);
  await command('Page.enable', {}, sessionId);
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, sessionId);
  await command('Network.enable', {}, sessionId);

  // Keep the smoke test offline except for the local application.
  await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);
  await command('Page.navigate', { url: base + '/login' }, sessionId);
  await until(sessionId, `!!document.querySelector('input[name="identifier"]')`, 'login form');
  // Tests explicitly authenticate; page visits must never create a session.
  if (email) await evaluate(sessionId, `(async () => { const response = await fetch('/api/v1/auth/login', { method: 'POST', body: new URLSearchParams({identifier: ${JSON.stringify(email)}, password: 'DummyUser123!'}) }); if (!response.ok) throw new Error('Login failed'); })()`);
  return sessionId;
}
async function navigate(page, route) {
  await command('Page.navigate', { url: base + route }, page);
  await until(page, `location.pathname === ${JSON.stringify(route)} && !!document.querySelector('aside[aria-label="Main navigation"]')`, `load ${route}`);
}
async function fill(page, selector, value) {
  await evaluate(page, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Input not found'); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}
async function button(page, text) {
  await until(page, `[...document.querySelectorAll('button')].some(element => element.textContent.trim() === ${JSON.stringify(text)} && !element.disabled)`, `button ${text}`);
  await evaluate(page, `(() => { const button = [...document.querySelectorAll('button')].find(element => element.textContent.trim() === ${JSON.stringify(text)}); if (!button) throw new Error('Button not found: ' + ${JSON.stringify(text)}); button.click(); })()`);
}
async function enter(page, shift = false) {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', modifiers: shift ? 8 : 0 }, page);
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: shift ? 8 : 0 }, page);
}
async function api(page, route, method = 'GET', body) {
  const result = await evaluate(page, `(async () => { const response = await fetch('/api/v1' + ${JSON.stringify(route)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }, ${body === undefined ? '' : `body: JSON.stringify(${JSON.stringify(body)}),`} credentials: 'include' }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(JSON.stringify(result)); return result.data; })()`);
  return result;
}
async function clickAt(page, selector) {
  const point = await evaluate(page, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); element.scrollIntoView({block: 'nearest'}); const r = element.getBoundingClientRect(); return {x: r.x + r.width / 2, y: r.y + r.height / 2}; })()`);
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', button: 'left', clickCount: 1, ...point }, page);
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', button: 'left', clickCount: 1, ...point }, page);
}
async function checkMessageMenus(page, label) {
  const selector = `summary[aria-label="${label}"]`;
  await until(page, `document.querySelectorAll(${JSON.stringify(selector)}).length >= 2`, 'two message menus');
  await evaluate(page, `document.querySelectorAll(${JSON.stringify(selector)})[0].click()`);
  await evaluate(page, `document.querySelectorAll(${JSON.stringify(selector)})[1].click()`);
  assert.equal(await evaluate(page, `document.querySelectorAll('details[data-message-actions][open]').length`), 1, 'Only one menu may be open');
  await clickAt(page, 'textarea[aria-label="Message"]');
  assert.equal(await evaluate(page, `document.querySelectorAll('details[data-message-actions][open]').length`), 0, 'Clicking away closes the menu');
  await evaluate(page, `document.querySelectorAll(${JSON.stringify(selector)})[0].click()`);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, page);
  assert.equal(await evaluate(page, `document.querySelectorAll('details[data-message-actions][open]').length`), 0, 'Escape closes the menu');
}
const stamp = String(Date.now());
let dummy, alex, originalDummy, originalAlex, postId, storyId, mediaURL;
try {
  for (const route of ['/', '/post/1', '/post/1/edit', '/profile', '/profile/someone', '/messages', '/messages/someone', '/groups', '/groups/1', '/connections', '/discover', '/notifications', '/create-post', '/CreatePost', '/missing-page']) {
    const response = await fetch(base + route, { redirect: 'manual' });
    assert.equal(response.status, 307, `Anonymous ${route} must redirect before rendering`);
    assert.equal(new URL(response.headers.get('location'), base).pathname, '/login');
  }
  assert.equal((await fetch(base + '/api/v1/posts')).status, 401, 'API authentication remains a 401');
  const guest = await createPage(null);
  await command('Page.navigate', { url: base + '/post/1' }, guest);
  await until(guest, `location.pathname === '/login' && !!document.querySelector('input[name="identifier"]')`, 'anonymous post redirects to login');
  await command('Network.setCookie', { name: 'session_token', value: 'expired-session', url: base, httpOnly: true }, guest);
  await command('Page.navigate', { url: base + '/' }, guest);
  await until(guest, `location.pathname === '/login' && !!document.querySelector('input[name="identifier"]')`, 'invalid session redirects to login');
  assert(!(await evaluate(guest, 'document.body.innerText')).includes('Could not reach the backend'));
  console.log('PASS: all anonymous pages and invalid sessions redirect to login; API requests retain 401');

  dummy = await createPage();
  await navigate(dummy, '/');
  originalDummy = await api(dummy, '/users/me');
  assert.equal(originalDummy.nickname, 'dummyuser');
  console.log('PASS: authenticated frontend loads through the same-origin proxy');

  await navigate(dummy, '/create-post');
  await fill(dummy, 'input[placeholder="Give your post a title"]', `Browser ${stamp}`);
  await fill(dummy, 'textarea', `Persisted browser integration test ${stamp}`);
  const fixture = path.join(taskDir, 'pixel.png');
  await writeFile(fixture, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64'));
  const document = await command('DOM.getDocument', {}, dummy);
  const fileNode = await command('DOM.querySelector', { nodeId: document.root.nodeId, selector: 'input[type="file"]' }, dummy);
  await command('DOM.setFileInputFiles', { nodeId: fileNode.nodeId, files: [fixture] }, dummy);
  await until(dummy, `!!document.querySelector('img[alt="Preview of pixel.png"]')`, 'image preview');
  await button(dummy, 'Publish Post');
  await until(dummy, `location.pathname === '/' && document.body.innerText.includes(${JSON.stringify(`Browser ${stamp}`)})`, 'publish post');
  const created = (await api(dummy, '/posts')).posts.find(post => post.title === `Browser ${stamp}`);
  assert(created); postId = created.postId; mediaURL = created.imageUrls[0]; assert(mediaURL);
  await navigate(dummy, `/post/${postId}`);
  await until(dummy, `!!document.querySelector('button[aria-label="Upvote post"]')`, 'post details');
  await evaluate(dummy, `document.querySelector('button[aria-label="Upvote post"]').click()`);
  await until(dummy, `(async () => (await (await fetch('/api/v1/post?id=${postId}')).json()).data.score === 1)()`, 'post reaction');
  console.log('PASS: post creation, image upload, detail page and reaction persist');

  await evaluate(dummy, `document.querySelector('a[aria-label="Edit post"]').click()`);
  await until(dummy, `document.querySelector('h1')?.textContent === 'Edit Post' && !!document.querySelector('img[alt="Photo 1"]')`, 'prefilled post editor');
  assert.equal(await evaluate(dummy, `document.querySelector('input[placeholder="Give your post a title"]').value`), created.title);
  await fill(dummy, 'input[placeholder="Give your post a title"]', 'Cancelled edit');
  await evaluate(dummy, `[...document.querySelectorAll('main a')].find(link => link.textContent === 'Cancel').click()`);
  await until(dummy, `location.pathname === '/post/${postId}' && !!document.querySelector('a[aria-label="Edit post"]')`, 'cancel edit');
  assert.equal((await api(dummy, `/post?id=${postId}`)).title, created.title);
  await evaluate(dummy, `document.querySelector('a[aria-label="Edit post"]').click()`);
  await until(dummy, `document.querySelector('h1')?.textContent === 'Edit Post'`, 'reopen editor');
  await fill(dummy, 'input[placeholder="Give your post a title"]', `Updated ${stamp}`);
  await fill(dummy, 'textarea', `Updated browser post content ${stamp}`);
  await button(dummy, 'Save changes');
  await until(dummy, `location.pathname === '/post/${postId}' && document.body.innerText.includes(${JSON.stringify(`Updated browser post content ${stamp}`)})`, 'saved post');
  const edited = await api(dummy, `/post?id=${postId}`);
  assert.equal(edited.title, `Updated ${stamp}`);
  assert.deepEqual(edited.imageUrls, created.imageUrls);
  assert.equal(edited.score, 1);
  console.log('PASS: owner edit button, prefilled editor, cancel and save preserve photos and votes');

  alex = await createPage('alex@example.com');
  await navigate(alex, '/');
  originalAlex = await api(alex, '/users/me');
  await navigate(alex, '/messages');
  await until(alex, `document.querySelector('aside[aria-label="Conversations"]').innerText.includes('Your conversations will appear here')`, 'empty inbox excludes unrelated users');
  assert.equal((await api(alex, '/messages/users')).length, 0);
  assert(await evaluate(alex, `!!document.querySelector('a[aria-label="New message"]')`));
  await navigate(alex, `/post/${postId}`);
  await until(alex, `!!document.querySelector('button[aria-label="Upvote post"]')`, 'other author post');
  assert(!(await evaluate(alex, `!!document.querySelector('a[aria-label="Edit post"]')`)));
  await navigate(alex, `/post/${postId}/edit`);
  await until(alex, `document.body.innerText.includes('You can only edit your own posts.')`, 'non-owner editor denied');
  assert(!(await evaluate(alex, `!!document.querySelector('input[placeholder="Give your post a title"]')`)));
  await navigate(alex, `/post/${postId}`);
  await until(alex, `!!document.querySelector('article')`, 'Alex post details');
  assert(await evaluate(alex, `!!document.querySelector('#comment-${postId}')`), 'Post comments open by default');
  await fill(alex, `#comment-${postId}`, `Browser comment ${stamp}`);
  await button(alex, 'Comment');
  await until(alex, `document.body.innerText.includes(${JSON.stringify(`Browser comment ${stamp}`)}) && document.querySelector('textarea').value === ''`, 'comment creation');
  await fill(alex, `#comment-${postId}`, 'Draft preserved while voting');
  await evaluate(alex, `window.commentRow = document.querySelector('[aria-label="Upvote comment"]').parentElement.parentElement; performance.clearResourceTimings()`);
  for (const [label, score] of [['Upvote comment', 1], ['Upvote comment', 0], ['Downvote comment', -1], ['Upvote comment', 1]]) {
    await evaluate(alex, `document.querySelector('[aria-label="${label}"]').click()`);
    await until(alex, `document.querySelector('[aria-label="Upvote comment"]').nextElementSibling.textContent === '${score}' && !document.querySelector('[aria-label="Upvote comment"]').disabled`, `comment score ${score}`);
    assert(await evaluate(alex, `window.commentRow === document.querySelector('[aria-label="Upvote comment"]').parentElement.parentElement && document.querySelector('textarea').value === 'Draft preserved while voting'`));
  }
  const refetchedWhileVoting = await evaluate(alex, `performance.getEntriesByType('resource').map(entry => entry.name).filter(name => name.includes('/api/v1/post'))`);
  assert.deepEqual(refetchedWhileVoting, [], `Comment voting must not refetch the post or comments: ${JSON.stringify(refetchedWhileVoting)}`);
  console.log('PASS: comment votes toggle in place without refetching or losing the draft');

  // A comment can carry an uploaded photo, exactly like a post.
  const commentPhotoFixture = path.join(taskDir, 'comment-photo.png');
  await writeFile(commentPhotoFixture, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64'));
  const commentDocument = await command('DOM.getDocument', {}, alex);
  const commentPicker = await command('DOM.querySelector', { nodeId: commentDocument.root.nodeId, selector: 'input[aria-label="Add photos"]' }, alex);
  await command('DOM.setFileInputFiles', { nodeId: commentPicker.nodeId, files: [commentPhotoFixture] }, alex);
  await until(alex, `!!document.querySelector('img[alt="Preview of comment-photo.png"]')`, 'comment photo preview');
  await fill(alex, `#comment-${postId}`, `Browser comment with a photo ${stamp}`);
  await button(alex, 'Comment');
  await until(alex, `!!document.querySelector('img[alt="Comment attachment"]')`, 'comment photo renders');
  const photoComment = (await api(alex, `/posts/comments?postId=${postId}`)).comments.find(item => item.commentText === `Browser comment with a photo ${stamp}`);
  assert(photoComment && photoComment.imageUrls.length === 1, `the comment kept its photo: ${JSON.stringify(photoComment)}`);
  const commentPhoto = photoComment.imageUrls[0];
  assert(await evaluate(alex, `(async () => (await fetch(${JSON.stringify(commentPhoto)})).ok)()`), 'the uploaded comment photo is served');
  console.log('PASS: a comment carries an uploaded photo, renders it and stores its URL');

  // The profile media tab lists comment photos next to post photos.
  await navigate(alex, '/profile');
  await until(alex, `!!document.querySelector('[aria-label="Profile statistics"]')`, 'own profile');
  await evaluate(alex, `[...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'media').click()`);
  await until(alex, `[...document.querySelectorAll('a[href="/post/${postId}"] img')].some(image => image.getAttribute('src') === ${JSON.stringify(commentPhoto)})`, 'comment photo in the profile media tab');
  console.log('PASS: the profile media tab lists the comment photo');

  // Upload edge cases through the same-origin path the composers use: an empty
  // file and a file whose extension lies are both refused with 400, which is the
  // status the composer turns into a toast.
  //
  // The size ceilings are deliberately not driven from here. This harness enables
  // Fetch interception on every request, and a body in the tens of megabytes
  // wedges it before the reply reaches the script — measured twice, at 11 MB and
  // at 50 MB. The ceilings are asserted in backend/cmd/media_upload_test.go, and
  // the rewrite itself was measured forwarding a 50 MB body into a 413 in 0.11s
  // by hand, so what is missing here is harness reach, not application coverage.
  const uploadFixture = (name, type, bytes) => `(async () => {
    const form = new FormData();
    form.append('file', new File([${bytes}], ${JSON.stringify(name)}, { type: ${JSON.stringify(type)} }));
    const response = await fetch('/api/v1/media', { method: 'POST', body: form, credentials: 'include' });
    return { status: response.status, body: await response.json().catch(() => ({})) };
  })()`;
  for (const [label, name, type, bytes, status, hint] of [
    ['an empty file', 'empty.png', 'image/png', 'new Uint8Array(0)', 400, 'empty'],
    ['an HTML document named .png', 'page.png', 'image/png', 'new TextEncoder().encode("<!DOCTYPE html><html><body>hi</body></html>")', 400, null],
  ]) {
    const result = await evaluate(alex, uploadFixture(name, type, bytes));
    assert.equal(result.status, status, `${label} answered ${result.status}: ${JSON.stringify(result.body)}`);
    if (hint) assert(String(result.body.error).includes(hint), `${label} reported ${JSON.stringify(result.body.error)}`);
  }
  console.log('PASS: empty and mismatched uploads are refused with the right status');

  const notificationCount = (await api(dummy, '/notifications/unread-count?exclude=message')).count;
  await until(dummy, `!!document.querySelector('[aria-label="${notificationCount} unread notifications"]')`, 'notification badge updates without refresh', 10000);
  const notifications = await api(dummy, '/notifications');
  assert(notifications.notifications.some(item => item.entityType === 'comment' && item.actorId === originalAlex.userId));
  await navigate(dummy, '/notifications');
  await until(dummy, `!!document.querySelector('a[href="/post/${postId}"]')`, 'comment notification links to its post');
  console.log('PASS: second user comments and the post owner receives a notification');

  await navigate(alex, '/discover');
  await until(alex, `document.querySelector('h1')?.textContent === 'Discover People' && document.querySelector('main').innerText.includes('@dummyuser')`, 'discover users');
  await navigate(dummy, '/profile');
  await until(dummy, `!!document.querySelector('[aria-label="Profile statistics"] button')`, 'own profile statistics');
  await evaluate(dummy, `[...document.querySelectorAll('[aria-label="Profile statistics"] button')].find(button => button.textContent.includes('followers')).click()`);
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Followers and following"]')`, 'followers dialog opens from the profile statistics');
  if (!originalAlex.following.includes(originalDummy.userId)) await button(alex, 'Follow');
  await until(dummy, `document.querySelector('[role="dialog"]').innerText.includes('@alexdemo')`, 'live follower list inside the dialog');
  const profileFollows = await api(dummy, `/users/${originalDummy.userId}/follows`);
  assert(profileFollows.followers.some(person => person.userId === originalAlex.userId), 'the profile route returns the followers shown in the dialog');
  await evaluate(dummy, `[...document.querySelectorAll('[role="dialog"] button')].find(button => button.textContent.startsWith('Following')).click()`);
  await until(dummy, `document.querySelector('[role="dialog"] button[aria-pressed="true"]').textContent.startsWith('Following')`, 'switch to the following tab');
  assert(!(await evaluate(alex, 'document.body.innerText')).includes('Connect'));
  assert(!(await evaluate(dummy, 'document.body.innerText')).includes('Received requests'));
  await evaluate(dummy, `document.querySelector('[aria-label="Close followers and following"]').click()`);
  await until(dummy, `!document.querySelector('[role="dialog"]')`, 'dismiss followers dialog');
  console.log('PASS: profile statistics open the live followers dialog without connection controls');

  // Counts the comments the post already carries, so the audience edit below is
  // asserted to preserve them rather than to match a hardcoded number.
  const commentsBeforeAudienceEdit = (await api(dummy, `/post?id=${postId}`)).commentsCounter;
  await navigate(dummy, `/post/${postId}/edit`);
  await until(dummy, `document.querySelector('h1')?.textContent === 'Edit Post'`, 'edit audience');
  await fill(dummy, 'main select', 'selected');
  await until(dummy, `!!document.querySelector('input[aria-label="Alex Demo"]')`, 'named follower choice');
  assert(!(await evaluate(dummy, `document.querySelector('fieldset').innerText`)).includes(originalAlex.userId));
  await evaluate(dummy, `document.querySelector('input[aria-label="Alex Demo"]').click()`);
  await button(dummy, 'Save changes');
  await until(dummy, `location.pathname === '/post/${postId}' && !!document.querySelector('article')`, 'saved audience');
  const restricted = await api(dummy, `/post?id=${postId}`);
  assert.equal(restricted.privacy, 'selected');
  assert.deepEqual(restricted.selectedFollowerIds, [originalAlex.userId]);
  assert.equal(restricted.commentsCounter, commentsBeforeAudienceEdit);
  console.log('PASS: editing selected followers preserves comments and saves the correct audience');

  await navigate(dummy, '/profile');
  await navigate(alex, `/profile/${originalDummy.userId}`);
  await until(alex, `!!document.querySelector('[aria-label="Profile statistics"]') && document.body.innerText.includes('Unfollow')`, 'profile follow control');
  const beforeFollow = await api(dummy, '/users/me');
  const stats = followers => `document.querySelector('[aria-label="Profile statistics"]')?.innerText.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(`${followers} followers ${beforeFollow.following.length} following`)}`;
  await button(alex, 'Unfollow');
  await until(alex, stats(beforeFollow.followers.length - 1), 'viewed profile updates follower count');
  await until(dummy, stats(beforeFollow.followers.length - 1), 'owner sees live follower count');
  await button(alex, 'Follow');
  await until(alex, stats(beforeFollow.followers.length), 'follow restores follower count');
  await until(dummy, stats(beforeFollow.followers.length), 'owner sees restored count');
  console.log('PASS: profile follow/unfollow and live database counts');

  // A pending follow must not grant access to the private profile or its media.
  // The previous journey explicitly selected Alex; use follower-based access here.
  await api(dummy, `/posts/${postId}`, 'PUT', { ...restricted, privacy: 'followers', selectedFollowerIds: [] });
  await api(alex, `/users/${originalDummy.userId}/follow`, 'DELETE');
  const privateOwner = await api(dummy, '/users/me');
  await api(dummy, '/users/me', 'PUT', { ...privateOwner, isPublic: false });
  await navigate(dummy, '/notifications');
  await navigate(alex, `/profile/${originalDummy.userId}`);
  await button(alex, 'Follow');
  await until(alex, `!!document.querySelector('button[title="Cancel follow request"]')`, 'private profile shows Requested');
  // A blocked chat is explained before the click: the profile swaps the Message
  // link for a disabled action that states the rule, instead of letting the
  // attempt fail with the backend's 403.
  assert(await evaluate(alex, `!document.querySelector('a[href="/messages/${originalDummy.userId}"]') && [...document.querySelectorAll('[title]')].some(node => node.getAttribute('title').includes('one of you follows the other'))`), 'a private profile replaces the message link with an explanation');
  assert.equal((await api(dummy, '/users/me')).followers.includes(originalAlex.userId), false);
  assert.equal(await evaluate(alex, `(async () => (await fetch('/api/v1/media/${mediaURL.split('/').pop()}', { cache: 'no-store' })).status)()`), 403);
  // The chat rule: a stranger cannot open or write a private thread with a
  // private profile, and the rejected message must never be stored.
  assert.equal(await evaluate(alex, `(async () => (await fetch('/api/v1/messages?partnerId=${originalDummy.userId}', { cache: 'no-store' })).status)()`), 403, 'a private profile must hide the thread from a stranger');
  assert.equal(await evaluate(alex, `(async () => (await fetch('/api/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId: ${JSON.stringify(originalDummy.userId)}, text: 'stranger hello' }) })).status)()`), 403, 'a private profile must reject a stranger message');
  assert.equal((await api(alex, '/messages/users')).some(person => person.userId === originalDummy.userId), false, 'a blocked thread must not appear in the inbox');
  await until(dummy, `document.querySelector('section[aria-label="Follow requests"]').innerText.includes('@alexdemo')`, 'request arrives live');
  await button(dummy, 'Decline');
  await until(alex, `!document.querySelector('button[title="Cancel follow request"]') && [...document.querySelectorAll('button')].some(b => b.textContent === 'Follow')`, 'decline restores Follow');

  await navigate(alex, '/discover');
  await fill(alex, 'input[aria-label="Search people"]', 'dummyuser');
  await button(alex, 'Search');
  await until(alex, `document.querySelector('main').innerText.includes('@dummyuser')`, 'find private user');
  assert(await evaluate(alex, `!document.querySelector('a[href="/messages/${originalDummy.userId}"]')`), 'discover hides the message link for a blocked chat');
  await button(alex, 'Follow');
  await until(alex, `!!document.querySelector('button[title="Cancel follow request"]')`, 'discovery shows Requested');
  await button(alex, 'Requested');
  await until(dummy, `document.querySelector('section[aria-label="Follow requests"]').innerText.includes('No pending follow requests.')`, 'cancel removes incoming request');
  await until(alex, `!document.querySelector('button[title="Cancel follow request"]')`, 'cancel restores discovery button');

  await button(alex, 'Follow');
  await navigate(alex, `/profile/${originalDummy.userId}`);
  await until(alex, `!!document.querySelector('button[title="Cancel follow request"]')`, 'pending survives navigation');
  await until(dummy, `document.querySelector('section[aria-label="Follow requests"]').innerText.includes('@alexdemo')`, 'second request arrives');
  await button(dummy, 'Accept');
  await until(alex, `document.body.innerText.includes('Unfollow') && document.body.innerText.includes(${JSON.stringify(`Updated ${stamp}`)})`, 'accept unlocks private profile live');
  assert(await evaluate(alex, `!!document.querySelector('a[href="/messages/${originalDummy.userId}"]')`), 'accepting the follow restores the message action');
  assert.equal((await api(dummy, '/users/me')).followers.includes(originalAlex.userId), true);
  assert.equal(await evaluate(alex, `(async () => (await fetch('/api/v1/media/${mediaURL.split('/').pop()}', { cache: 'no-store' })).status)()`), 200);
  await api(dummy, '/users/me', 'PUT', { ...privateOwner, isPublic: originalDummy.isPublic });
  console.log('PASS: private follow request, live notification, decline, cancel and accept with media privacy');

  await navigate(dummy, '/messages/groups');
  assert(!(await evaluate(dummy, `document.querySelector('aside[aria-label="Main navigation"]').innerText`)).includes('Groups'));
  assert(!(await evaluate(dummy, `document.body.innerText`)).includes('Development user'));
  await evaluate(dummy, `document.querySelector('[aria-label="Create group"]').click()`);
  await fill(dummy, 'input[name="title"]', `Browser group ${stamp}`);
  await fill(dummy, 'textarea[name="description"]', 'Browser group join workflow');
  await button(dummy, 'Create group');
  await until(dummy, `location.pathname.startsWith('/messages/groups/') && document.body.innerText.includes(${JSON.stringify(`Browser group ${stamp}`)})`, 'create group inside messages');
  const group = (await api(dummy, '/groups')).find(item => item.title === `Browser group ${stamp}`);
  await navigate(alex, '/messages/groups');
  await until(alex, `document.querySelector('aside[aria-label="Conversations"]').innerText.includes('Your joined groups will appear here')`, 'unjoined group is absent from inbox');
  await button(alex, 'Find groups to join');
  await until(alex, `!!document.querySelector('aside[aria-label="Conversations"] a[href="/messages/groups/${group.groupId}"]')`, 'explicit group discovery');
  await evaluate(alex, `document.querySelector('aside[aria-label="Conversations"] a[href="/messages/groups/${group.groupId}"]').click()`);
  await button(alex, 'Request to join');
  await until(alex, `document.querySelector('section > header').innerText.includes('Request pending')`, 'pending request updates group header immediately', 3000);
  const groupNotificationCount = (await api(dummy, '/notifications/unread-count?exclude=message')).count;
  await until(dummy, `!!document.querySelector('[aria-label="${groupNotificationCount} unread notifications"]')`, 'group notification badge updates live', 10000);
  await button(dummy, 'Group info');
  await until(dummy, `document.body.innerText.includes('alexdemo')`, 'owner receives request');
  await button(dummy, 'Accept');
  await until(dummy, `document.body.innerText.includes('2 members')`, 'owner accepts request');
  await until(alex, `!!document.querySelector('[aria-label="Group conversation tabs"]')`, 'group membership updates without refresh', 10000);
  assert((await api(alex, '/groups?scope=joined')).some(item => item.groupId === group.groupId));
  await button(dummy, 'Chat');
  await fill(dummy, 'textarea[aria-label="Message"]', `Group hello ${stamp}`);
  await evaluate(dummy, `document.querySelector('[aria-label="Send message"]').click()`);
  await until(alex, `document.body.innerText.includes(${JSON.stringify(`Group hello ${stamp}`)})`, 'live group message');
  assert((await evaluate(alex, `document.querySelector('section[aria-label^="Group conversation"]').innerText`)).includes('Dummy User'));
  assert(await evaluate(dummy, `document.activeElement === document.querySelector('textarea[aria-label="Message"]')`), 'Group composer keeps focus after sending');
  const groupMessageColor = await evaluate(dummy, `getComputedStyle([...document.querySelectorAll('article')].find(item => item.innerText.includes(${JSON.stringify(`Group hello ${stamp}`)}))).backgroundColor`);
  await fill(dummy, 'textarea[aria-label="Message"]', `Second group message ${stamp}`);
  await clickAt(dummy, '[aria-label="Send message"]');
  await until(dummy, `document.querySelector('textarea[aria-label="Message"]').value === ''`, 'second group message sent');
  assert(await evaluate(dummy, `document.activeElement === document.querySelector('textarea[aria-label="Message"]')`), 'Mouse send restores composer focus');
  await checkMessageMenus(dummy, 'Group item actions');
  await button(dummy, 'Event');
  await fill(dummy, 'input[name="title"]', `Meetup ${stamp}`);
  await fill(dummy, 'input[name="startsAt"]', '2030-12-01T18:00');
  await fill(dummy, 'textarea[name="content"]', 'Meet at the park');
  await button(dummy, 'Create event');
  await until(alex, `document.body.innerText.includes(${JSON.stringify(`Meetup ${stamp}`)})`, 'event appears in chat');
  await button(alex, 'Going');
  await until(dummy, `document.body.innerText.includes('1 going')`, 'live RSVP');
  await button(dummy, 'Posts');
  await button(dummy, 'Post');
  await fill(dummy, 'textarea[name="content"]', `Group post ${stamp}`);
  await button(dummy, 'Publish');
  await until(dummy, `document.body.innerText.includes(${JSON.stringify(`Group post ${stamp}`)})`, 'group post stays in conversation');
  assert(await evaluate(dummy, `[...document.querySelectorAll('button')].some(item => item.textContent === 'Hide comments' && item.getAttribute('aria-expanded') === 'true')`), 'Group post comments open by default');
  await button(dummy, 'Group info');
  await button(dummy, 'Edit group');
  await fill(dummy, 'textarea[name="description"]', 'Updated group description');
  await button(dummy, 'Save group');
  await until(dummy, `!document.querySelector('textarea[name="description"]') && document.body.innerText.includes('Updated group description')`, 'group edit');
  const groupShot = await command('Page.captureScreenshot', { format: 'png' }, dummy);
  await writeFile(path.join(taskDir, 'group-info.png'), Buffer.from(groupShot.data, 'base64'));
  await button(dummy, 'Chat');
  await until(dummy, `document.querySelector('section[aria-label^="Group conversation"]').innerText.includes(${JSON.stringify(`Group hello ${stamp}`)})`, 'chat is loaded for screenshot');
  const chatShot = await command('Page.captureScreenshot', { format: 'png' }, dummy);
  await writeFile(path.join(taskDir, 'group-chat.png'), Buffer.from(chatShot.data, 'base64'));
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, dummy);
  await pause(500);
  assert(await evaluate(dummy, 'document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile chat has no horizontal overflow');
  await clickAt(dummy, '[aria-label="Open navigation"]');
  await until(dummy, `document.querySelector('[aria-label="Open navigation"]').getAttribute('aria-expanded') === 'true'`, 'mobile sidebar opens');
  await until(dummy, `(() => { const button = document.querySelector('[aria-label="Close navigation"]'); const r = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })()`, 'Mobile close button is visible and clickable', 3000);
  await clickAt(dummy, '[aria-label="Close navigation"]');
  await until(dummy, `document.querySelector('[aria-label="Open navigation"]').getAttribute('aria-expanded') === 'false'`, 'mobile close button dismisses sidebar');
  await clickAt(dummy, '[aria-label="Open navigation"]');
  await command('Input.dispatchMouseEvent', { type: 'mousePressed', x: 370, y: 400, button: 'left', clickCount: 1 }, dummy);
  await command('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 370, y: 400, button: 'left', clickCount: 1 }, dummy);
  await until(dummy, `document.querySelector('[aria-label="Open navigation"]').getAttribute('aria-expanded') === 'false'`, 'backdrop dismisses sidebar');
  await clickAt(dummy, '[aria-label="Open navigation"]');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, dummy);
  await until(dummy, `document.querySelector('[aria-label="Open navigation"]').getAttribute('aria-expanded') === 'false'`, 'Escape dismisses sidebar');
  await until(dummy, `getComputedStyle(document.querySelector('aside[aria-label="Main navigation"]')).visibility === 'hidden' && document.querySelector('aside[aria-label="Main navigation"]').getBoundingClientRect().right <= 0`, 'sidebar is fully offscreen after closing');
  const mobileShot = await command('Page.captureScreenshot', { format: 'png' }, dummy);
  await writeFile(path.join(taskDir, 'mobile-chat.png'), Buffer.from(mobileShot.data, 'base64'));
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, dummy);
  console.log('PASS: groups inside conversations, join approval, group chat, events, RSVP, posts, editing and mobile layout');

  // A group notification opens the tab that needs attention instead of the chat:
  // a join request is answered on Group info, an event lives on Events.
  await navigate(dummy, '/notifications');
  await until(dummy, `!!document.querySelector('a[href="/messages/groups/${group.groupId}?tab=info"]')`, 'join request notification target');
  await evaluate(dummy, `document.querySelector('a[href="/messages/groups/${group.groupId}?tab=info"]').click()`);
  await until(dummy, `document.querySelector('[aria-label="Group conversation tabs"] button[aria-pressed="true"]')?.textContent === 'Group info'`, 'request notification opens the group info tab');
  // The member and request lists are paged now. A short group has to render every
  // member on the first page and report that the list has ended, with no way to
  // ask for a second page: a stray "Load more members" button would mean the page
  // size or the end-of-list rule is wired wrong.
  await until(dummy, `!!document.querySelector('a[href="/profile/${originalAlex.userId}"]')`, 'member list on the group info tab');
  assert(await evaluate(dummy, `[...document.querySelectorAll('button')].every(button => button.textContent.trim() !== 'Load more members')`), 'a short member list must not offer a second page');
  assert(await evaluate(dummy, `document.body.innerText.includes("You're all caught up")`), 'the member list has to report that it ended');
  await navigate(alex, '/notifications');
  await until(alex, `!!document.querySelector('a[href="/messages/groups/${group.groupId}?tab=events"]')`, 'event notification target');
  await evaluate(alex, `document.querySelector('a[href="/messages/groups/${group.groupId}?tab=events"]').click()`);
  await until(alex, `document.querySelector('[aria-label="Group conversation tabs"] button[aria-pressed="true"]')?.textContent === 'Events' && document.body.innerText.includes(${JSON.stringify(`Meetup ${stamp}`)})`, 'event notification opens the events tab');
  // The events tab is split into what is to come and what has been, and the split
  // is what the server decided when it ordered the tab: the new event has to sit
  // under the Upcoming heading. Compared in the DOM rather than in innerText,
  // because the heading is styled uppercase and innerText returns rendered text.
  assert(await evaluate(alex, `(() => { const heading = [...document.querySelectorAll('h4')].find(node => node.textContent.trim().toLowerCase() === 'upcoming'); const event = [...document.querySelectorAll('article')].find(node => node.innerText.includes(${JSON.stringify(`Meetup ${stamp}`)})); return !!heading && !!event && (heading.compareDocumentPosition(event) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0; })()`), 'the upcoming event belongs under the Upcoming heading');
  console.log('PASS: group notifications deep-link to the tab that needs attention');

  await navigate(dummy, '/');
  await evaluate(dummy, `[...document.querySelectorAll('button')].find(button => button.textContent.includes('Create story')).click()`);
  await fill(dummy, '[role="dialog"] textarea', `Browser story ${stamp}`);
  await button(dummy, 'Share story');
  await until(dummy, `!document.querySelector('[role="dialog"]') && document.body.innerText.includes(${JSON.stringify(`Browser story ${stamp}`)})`, 'create story');
  storyId = (await api(dummy, '/stories')).find(story => story.content === `Browser story ${stamp}`).storyId;
  await navigate(dummy, '/profile');
  await until(dummy, `document.body.innerText.includes('Edit profile')`, 'profile loaded');
  await button(dummy, 'Edit profile');
  await fill(dummy, '[role="dialog"] textarea', `Browser bio ${stamp}`);
  const locationSelector = '[role="dialog"] label:nth-of-type(4) input';
  assert.equal(await evaluate(dummy, `document.querySelector(${JSON.stringify(locationSelector)}).maxLength`), 50);
  await fill(dummy, locationSelector, 'L'.repeat(50));
  await button(dummy, 'Save changes');
  await until(dummy, `!document.querySelector('[role="dialog"]') && document.body.innerText.includes(${JSON.stringify(`Browser bio ${stamp}`)})`, 'profile save');
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, dummy);
  assert(await evaluate(dummy, `document.documentElement.scrollWidth <= window.innerWidth && [...document.querySelectorAll('p')].find(p => p.textContent.includes('${'L'.repeat(50)}')).scrollWidth <= document.querySelector('main').clientWidth`), 'Long location wraps on mobile');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, dummy);
  console.log('PASS: story creation, profile editing, location length and mobile wrapping');

  await navigate(dummy, `/messages/${originalAlex.userId}`);
  await navigate(alex, `/messages/${originalDummy.userId}`);
  await until(dummy, `!!document.querySelector('[title="Connected"]')`, 'dummy WebSocket');
  await until(alex, `!!document.querySelector('[title="Connected"]')`, 'Alex WebSocket');
  await fill(dummy, 'textarea[aria-label="Message"]', `Browser message ${stamp}`);
  await until(alex, `document.body.innerText.includes('Typing')`, 'live typing', 10000);
  await evaluate(dummy, `document.querySelector('textarea[aria-label="Message"]').focus()`);
  await enter(dummy, true);
  assert.equal(await evaluate(dummy, `document.querySelector('textarea[aria-label="Message"]').value`), `Browser message ${stamp}\n`);
  assert(!(await api(dummy, `/messages?partnerId=${originalAlex.userId}`)).messages.some(message => message.textMessage.includes(`Browser message ${stamp}`)), 'Shift+Enter must not send');
  await command('Input.insertText', { text: 'Second line' }, dummy);
  await enter(dummy);
  await until(alex, `document.body.innerText.includes(${JSON.stringify(`Browser message ${stamp}`)})`, 'live message receipt', 10000);
  await until(dummy, `!!document.querySelector('[aria-label="Read"]')`, 'message read receipt', 10000);
  const sentMessages = (await api(dummy, `/messages?partnerId=${originalAlex.userId}`)).messages.filter(message => message.textMessage.includes(`Browser message ${stamp}`));
  assert.equal(sentMessages.length, 1);
  assert.equal(await evaluate(dummy, `getComputedStyle([...document.querySelectorAll('article')].find(item => item.innerText.includes(${JSON.stringify(`Browser message ${stamp}`)}))).backgroundColor`), groupMessageColor, 'Own group and direct messages use the same bubble color');
  assert(await evaluate(dummy, `document.activeElement === document.querySelector('textarea[aria-label="Message"]')`), 'Direct composer keeps focus after Enter sends');
  await until(dummy, `!!document.querySelector('aside[aria-label="Conversations"] a[href="/messages/${originalAlex.userId}"]')`, 'first message adds conversation');
  await fill(dummy, 'textarea[aria-label="Message"]', `Second direct message ${stamp}`);
  await clickAt(dummy, '[aria-label="Send message"]');
  await until(dummy, `document.querySelector('textarea[aria-label="Message"]').value === ''`, 'second direct message sent');
  assert(await evaluate(dummy, `document.activeElement === document.querySelector('textarea[aria-label="Message"]')`), 'Direct composer keeps focus after mouse sends');
  await checkMessageMenus(dummy, 'Message actions');
  assert.equal(sentMessages[0].textMessage, `Browser message ${stamp}\nSecond line`);
  await evaluate(dummy, `document.querySelector('summary[aria-label="Message actions"]').click()`);
  await button(dummy, 'Edit message');
  await fill(dummy, 'textarea[aria-label="Message"]', `Edited browser message ${stamp}`);
  await evaluate(dummy, `document.querySelector('[aria-label="Save message"]').click()`);
  await until(alex, `document.body.innerText.includes(${JSON.stringify(`Edited browser message ${stamp}`)})`, 'live message edit', 10000);
  await evaluate(alex, `document.querySelector('summary[aria-label="Message actions"]').click()`);
  await button(alex, 'Delete for me');
  await until(alex, `!document.body.innerText.includes(${JSON.stringify(`Edited browser message ${stamp}`)})`, 'delete for recipient');
  assert(await evaluate(dummy, `document.body.innerText.includes(${JSON.stringify(`Edited browser message ${stamp}`)})`));
  await evaluate(dummy, `document.querySelector('summary[aria-label="Message actions"]').open || document.querySelector('summary[aria-label="Message actions"]').parentElement.setAttribute('open', '')`);
  await button(dummy, 'Delete for everyone');
  await until(dummy, `!document.body.innerText.includes(${JSON.stringify(`Edited browser message ${stamp}`)})`, 'delete for everyone');
  console.log('PASS: live typing, messages, read receipts, edits and scoped deletion');

  // New notifications and new private messages are displayed differently: the
  // bell counts everything except messages, the Messages entry counts only
  // those, so an unread chat must move one badge and leave the other alone.
  await navigate(alex, '/');
  await until(alex, `!!document.querySelector('aside[aria-label="Main navigation"]')`, 'Alex sidebar ready');
  const messagesBefore = (await api(alex, '/notifications/unread-count?types=message')).count;
  await api(dummy, '/messages', 'POST', { recipientId: originalAlex.userId, text: `Badge probe ${stamp}` });
  await until(alex, `!!document.querySelector('aside[aria-label="Main navigation"] a[href="/messages"] span[aria-label="${messagesBefore + 1} unread messages"]')`, 'messages badge counts the unread chat', 10000);
  const bellWithUnreadMessage = (await api(alex, '/notifications/unread-count?exclude=message')).count;
  await until(alex, `(document.querySelector('aside[aria-label="Main navigation"] a[href="/notifications"] span[aria-label$="unread notifications"]')?.textContent ?? '0') === ${JSON.stringify(String(bellWithUnreadMessage))}`, 'the bell badge ignores the unread chat', 10000);
  console.log('PASS: an unread chat moves the messages badge and not the bell');

  await navigate(alex, '/notifications');
  await until(alex, `[...document.querySelectorAll('a')].some(link => link.textContent.trim() === 'Open chat')`, 'message rows are their own card');
  assert(await evaluate(alex, `[...document.querySelectorAll('p')].some(item => item.textContent.includes('Private message') && item.className.includes('text-teal-700'))`), 'message cards carry their own accent');
  await until(alex, `!!document.querySelector('a[href="/messages/${originalDummy.userId}"]')`, 'the message card opens the chat');
  await navigate(alex, `/messages/${originalDummy.userId}`);
  await until(alex, `!document.querySelector('aside[aria-label="Main navigation"] a[href="/messages"] span[aria-label$="unread messages"]')`, 'opening the chat clears the messages badge', 10000);
  console.log('PASS: notifications and private messages are shown and counted separately');

  await api(dummy, '/auth/logout', 'POST');
  await fill(dummy, 'textarea[aria-label="Message"]', 'This unauthorized message must not be sent');
  await evaluate(dummy, `document.querySelector('[aria-label="Send message"]').click()`);
  await until(dummy, `location.pathname === '/login' && !!document.querySelector('input[name="identifier"]')`, 'expired session redirects to login');
  await fill(dummy, 'input[name="identifier"]', 'dummy@example.com');
  await fill(dummy, 'input[name="password"]', 'DummyUser123!');
  await evaluate(dummy, `document.querySelector('form').requestSubmit()`);
  await until(dummy, `location.pathname === '/' && !!document.querySelector('aside[aria-label="Main navigation"]')`, 'sign back in after expiry');
  console.log('PASS: API 401 redirects to login and the normal login form restores access');

  // The legacy /connections URL is kept as a redirect (see the page), so a
  // signed-in member has to land on the profile rather than on a 404. The
  // anonymous sweep above only proves the session gate fires.
  await command('Page.navigate', { url: base + '/connections' }, dummy);
  await until(dummy, `location.pathname === '/profile'`, 'the legacy connections URL redirects to the profile');
  console.log('PASS: the legacy connections URL still redirects to the profile');

  // The password change is the one flow that rotates the session, so it is worth
  // a browser pass rather than only the API test: the dialog must refuse a
  // mismatched confirmation, close on success, and leave this tab working on the
  // replacement cookie. The seeded password is restored at the end, because the
  // rest of the suite signs in with it.
  await navigate(dummy, '/profile');
  await button(dummy, 'Change password');
  await until(dummy, `!!document.querySelector('[aria-label="Change password"]')`, 'password dialog');
  await fill(dummy, 'input[name="currentPassword"]', 'DummyUser123!');
  await fill(dummy, 'input[name="newPassword"]', 'BrowserRotate123!');
  await fill(dummy, 'input[name="confirmPassword"]', 'BrowserRotate124!');
  await until(dummy, `!!document.querySelector('[aria-label="Change password"] [role="alert"]')`, 'a mismatched confirmation is flagged');
  assert(await evaluate(dummy, `[...document.querySelectorAll('[aria-label="Change password"] button')].find(item => item.textContent.trim() === 'Update password').disabled`), 'the submit button must stay disabled while the two entries differ');
  await fill(dummy, 'input[name="confirmPassword"]', 'BrowserRotate123!');
  await evaluate(dummy, `document.querySelector('[aria-label="Change password"] form').requestSubmit()`);
  await until(dummy, `!document.querySelector('[aria-label="Change password"]')`, 'the dialog closes once the password is changed', 15000);
  await navigate(dummy, '/profile');
  assert(await evaluate(dummy, `document.cookie.indexOf('session_token') === -1`), 'the rotated session cookie must stay HttpOnly');
  console.log('PASS: the password dialog rotates the session and this tab keeps working');

  await button(dummy, 'Change password');
  await until(dummy, `!!document.querySelector('[aria-label="Change password"]')`, 'password dialog for the restore');
  await fill(dummy, 'input[name="currentPassword"]', 'BrowserRotate123!');
  await fill(dummy, 'input[name="newPassword"]', 'DummyUser123!');
  await fill(dummy, 'input[name="confirmPassword"]', 'DummyUser123!');
  await evaluate(dummy, `document.querySelector('[aria-label="Change password"] form').requestSubmit()`);
  await until(dummy, `!document.querySelector('[aria-label="Change password"]')`, 'the seeded password is restored', 15000);
  console.log('PASS: the replacement password works as the current one and the seed is restored');

  // The signup form has to work from the mandatory fields alone: the nickname is
  // optional and the backend generates a handle, and the avatar, About me and the
  // visibility choice are present but skippable.
  const newcomer = await createPage(null);
  await button(newcomer, 'Need an account? Register');
  await until(newcomer, `!!document.querySelector('input[name="firstName"]')`, 'register form');
  assert(await evaluate(newcomer, `!document.querySelector('input[name="nickName"]').required`), 'the nickname field must be optional');
  assert(await evaluate(newcomer, `!!document.querySelector('textarea[name="aboutMe"]') && !!document.querySelector('select[name="isPublic"]') && !!document.querySelector('input[aria-label="Add photos"]')`), 'About me, the visibility choice and the avatar picker must be on the form');
  assert(await evaluate(newcomer, `['Nickname', 'About me'].every(text => [...document.querySelectorAll('form label')].some(label => label.textContent.includes(text) && label.textContent.includes('optional')))`), 'nickname and About me must be marked optional');
  assert(await evaluate(newcomer, `document.querySelector('form').innerText.includes('Profile photo (optional)')`), 'the avatar field must be marked optional');
  await fill(newcomer, 'input[name="firstName"]', 'Browser');
  await fill(newcomer, 'input[name="lastName"]', `Minimal${stamp}`);
  await fill(newcomer, 'input[name="email"]', `browser-minimal-${stamp}@example.com`);
  await fill(newcomer, 'input[name="birthDate"]', '2000-01-01');
  await fill(newcomer, 'select[name="gender"]', 'female');
  await fill(newcomer, 'input[name="password"]', 'BrowserSignup123!');
  await fill(newcomer, 'input[name="confirmPassword"]', 'BrowserSignup123!');
  await button(newcomer, 'Create account');
  await until(newcomer, `location.pathname === '/' && !!document.querySelector('aside[aria-label="Main navigation"]')`, 'minimal signup reaches the feed', 15000);
  const minimalProfile = await api(newcomer, '/users/me');
  assert(/^[a-z0-9_]{2,33}$/.test(minimalProfile.nickname), `generated handle: ${JSON.stringify(minimalProfile.nickname)}`);
  console.log('PASS: signing up with the mandatory fields only generates a handle');

  // The same form with everything filled in: the chosen handle survives, About me
  // and the private choice land on the profile, and the photo is uploaded with
  // the session the signup just created.
  const optional = await createPage(null);
  await button(optional, 'Need an account? Register');
  await until(optional, `!!document.querySelector('input[name="firstName"]')`, 'second register form');
  await fill(optional, 'input[name="firstName"]', 'Browser');
  await fill(optional, 'input[name="lastName"]', `Optional${stamp}`);
  await fill(optional, 'input[name="nickName"]', `opted_${stamp}`);
  await fill(optional, 'input[name="email"]', `browser-optional-${stamp}@example.com`);
  await fill(optional, 'input[name="birthDate"]', '2000-01-01');
  await fill(optional, 'select[name="gender"]', 'male');
  await fill(optional, 'input[name="password"]', 'BrowserSignup123!');
  await fill(optional, 'input[name="confirmPassword"]', 'BrowserSignup123!');
  await fill(optional, 'textarea[name="aboutMe"]', `About me ${stamp}`);
  await fill(optional, 'select[name="isPublic"]', 'false');
  await until(optional, `document.body.innerText.includes('Nickname is available.')`, 'nickname availability');
  const avatarFixture = path.join(taskDir, 'avatar.png');
  await writeFile(avatarFixture, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64'));
  const registerDocument = await command('DOM.getDocument', {}, optional);
  const avatarInput = await command('DOM.querySelector', { nodeId: registerDocument.root.nodeId, selector: 'input[aria-label="Add photos"]' }, optional);
  await command('DOM.setFileInputFiles', { nodeId: avatarInput.nodeId, files: [avatarFixture] }, optional);
  await until(optional, `!!document.querySelector('img[alt="Preview of avatar.png"]')`, 'avatar preview before signup');
  await button(optional, 'Create account');
  await until(optional, `location.pathname === '/' && !!document.querySelector('aside[aria-label="Main navigation"]')`, 'optional signup reaches the feed', 15000);
  const optionalProfile = await api(optional, '/users/me');
  assert.equal(optionalProfile.nickname, `opted_${stamp}`);
  assert.equal(optionalProfile.bio, `About me ${stamp}`);
  assert.equal(optionalProfile.isPublic, false);
  assert(/^\/api\/v1\/media\//.test(optionalProfile.avatar), `the signup photo was not saved: ${JSON.stringify(optionalProfile.avatar)}`);
  assert(await evaluate(optional, `(async () => (await fetch(${JSON.stringify(optionalProfile.avatar)})).ok)()`), 'the signup photo is served');
  console.log('PASS: the optional signup fields reach the profile and the avatar uploads after signup');

  await navigate(dummy, '/');
  await until(dummy, `!!document.querySelector('article')`, 'feed ready for scroll');
  await evaluate(dummy, `window.scrollTo(0, document.body.scrollHeight)`);
  const sidebarPosition = await evaluate(dummy, `({ scrollY: window.scrollY, top: document.querySelector('aside[aria-label="Main navigation"]').getBoundingClientRect().top, bodyHeight: document.body.offsetHeight, viewport: window.innerHeight })`);
  assert(sidebarPosition.scrollY > 0 && Math.abs(sidebarPosition.top) < 1, `Sidebar stays at top while the feed scrolls: ${JSON.stringify(sidebarPosition)}`);
  assert(await evaluate(dummy, `document.querySelector('aside img[alt="Social Network"]').naturalWidth > 0`), 'Sidebar logo loads');
  await evaluate(dummy, `window.scrollTo(0, 0)`);
  const screenshot = await command('Page.captureScreenshot', { format: 'png' }, dummy);
  await writeFile(path.join(taskDir, 'frontend.png'), Buffer.from(screenshot.data, 'base64'));
  // Responsive review, measured rather than eyeballed: each surface has to fit
  // the four widths the release list names without horizontal overflow, and the
  // failure message reports the widest node so a regression is actionable.
  for (const route of ['/messages', `/messages/groups/${group.groupId}`, '/profile', '/notifications', '/discover']) {
    for (const width of [320, 375, 768, 1440]) {
      await command('Emulation.setDeviceMetricsOverride', { width, height: 900, deviceScaleFactor: 1, mobile: width < 640 }, dummy);
      await navigate(dummy, route);
      const fit = await evaluate(dummy, `(() => {
        let widest = { right: 0, tag: '', text: '' };
        for (const node of document.querySelectorAll('main *')) {
          const rect = node.getBoundingClientRect();
          if (rect.right > widest.right) widest = { right: Math.round(rect.right), tag: node.tagName, text: (node.innerText || '').replace(/\\s+/g, ' ').slice(0, 30) };
        }
        return { scrollWidth: document.documentElement.scrollWidth, viewport: window.innerWidth, widest };
      })()`);
      assert(fit.scrollWidth <= fit.viewport + 1, `${route} overflows at ${width}px: ${JSON.stringify(fit)}`);
    }
  }
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, dummy);
  console.log('PASS: messages, group chat, profile, notifications and discover fit 320, 375, 768 and 1440 px');
  assert.deepEqual(exceptions, [], 'Browser runtime exceptions');
  console.log('PASS: no browser runtime exceptions');
} finally {
  if (dummy && originalDummy) {
    if (postId) await api(dummy, `/posts?id=${postId}`, 'DELETE').catch(() => {});
    if (storyId) await api(dummy, `/stories/${storyId}`, 'DELETE').catch(() => {});
    await api(dummy, '/users/me', 'PUT', originalDummy).catch(() => {});
  }
  if (alex && originalAlex && originalDummy && !originalAlex.following.includes(originalDummy.userId)) await api(alex, `/users/${originalDummy.userId}/follow`, 'DELETE').catch(() => {});
  await writeFile(path.join(taskDir, 'result.json'), JSON.stringify({ postId, storyId, mediaURL, exceptions, exceptionDetails, failedResponses }, null, 2));
  await command('Browser.close').catch(() => {});
  socket.close();
  browser.kill();
}
