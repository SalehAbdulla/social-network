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
const failedResponses = [];
socket.addEventListener('message', async ({ data }) => {
  const event = JSON.parse(String(data));
  if (event.id) {
    const entry = pending.get(event.id); if (!entry) return;
    pending.delete(event.id); clearTimeout(entry.timer);
    if (event.error) entry.reject(new Error(JSON.stringify(event.error))); else entry.resolve(event.result);
  }
  if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails.text + ': ' + (event.params.exceptionDetails.exception?.description || ''));
  if (event.method === 'Network.responseReceived' && event.params.response.status >= 400 && event.params.response.url.startsWith(base)) {
    failedResponses.push({ url: event.params.response.url, status: event.params.response.status });
  }
  if (event.method === 'Fetch.requestPaused') {
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
  await command('Network.enable', {}, sessionId);
  await command('Page.addScriptToEvaluateOnNewDocument', {
    source: `if (location.origin === ${JSON.stringify(base)} && !localStorage.getItem('social:dev-user')) localStorage.setItem('social:dev-user', ${JSON.stringify(email)});`,
  }, sessionId);
  // Keep the smoke test offline except for the local application.
  await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);
  await command('Page.navigate', { url: base + '/login' }, sessionId);
  await until(sessionId, `!!document.querySelector('input[name="identifier"]')`, 'login form');
  // Tests explicitly authenticate; page visits must never create a session.
  if (email) await api(sessionId, '/dev/session', 'POST', { email });
  return sessionId;
}
async function navigate(page, route) {
  await command('Page.navigate', { url: base + route }, page);
  await until(page, `!!document.querySelector('select[aria-label="Development user"]')`, `load ${route}`);
}
async function fill(page, selector, value) {
  await evaluate(page, `(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) throw new Error('Input not found'); Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), 'value').set.call(element, ${JSON.stringify(value)}); element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true })); })()`);
}
async function button(page, text) {
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
const stamp = String(Date.now());
let dummy, alex, originalDummy, originalAlex, postId, storyId, mediaURL;
try {
  for (const route of ['/', '/post/1', '/profile', '/profile/someone', '/messages', '/messages/someone', '/groups', '/groups/1', '/connections', '/discover', '/notifications', '/create-post', '/CreatePost', '/missing-page']) {
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
  await button(dummy, 'Publish Post');
  await until(dummy, `location.pathname === '/' && document.body.innerText.includes(${JSON.stringify(`Browser ${stamp}`)})`, 'publish post');
  const created = (await api(dummy, '/posts')).posts.find(post => post.title === `Browser ${stamp}`);
  assert(created); postId = created.postId; mediaURL = created.imageUrls[0]; assert(mediaURL);
  await navigate(dummy, `/post/${postId}`);
  await until(dummy, `!!document.querySelector('button[aria-label="Upvote post"]')`, 'post details');
  await evaluate(dummy, `document.querySelector('button[aria-label="Upvote post"]').click()`);
  await until(dummy, `(async () => (await (await fetch('/api/v1/post?id=${postId}')).json()).data.score === 1)()`, 'post reaction');
  console.log('PASS: post creation, image upload, detail page and reaction persist');

  alex = await createPage('alex@example.com');
  await navigate(alex, '/');
  await fill(alex, 'select[aria-label="Development user"]', 'alex@example.com');
  await until(alex, `document.querySelector('select[aria-label="Development user"]')?.value === 'alex@example.com' && document.body.innerText.includes('@alexdemo')`, 'switch demo user');
  originalAlex = await api(alex, '/users/me');
  await navigate(alex, `/post/${postId}`);
  await until(alex, `!!document.querySelector('article')`, 'Alex post details');
  await evaluate(alex, `[...document.querySelectorAll('button')].find(button => button.textContent.includes('comments')).click()`);
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
  assert(await evaluate(alex, `!performance.getEntriesByType('resource').some(entry => entry.name.includes('/api/v1/post'))`), 'Comment voting must not refetch the post or comments');
  console.log('PASS: comment votes toggle in place without refetching or losing the draft');
  const notifications = await api(dummy, '/notifications');
  assert(notifications.notifications.some(item => item.entityType === 'comment' && item.actorId === originalAlex.userId));
  await navigate(dummy, '/notifications');
  await until(dummy, `!!document.querySelector('a[href="/post/${postId}"]')`, 'comment notification links to its post');
  console.log('PASS: second user comments and the post owner receives a notification');

  await navigate(alex, '/discover');
  await until(alex, `document.body.innerText.includes('@dummyuser')`, 'discover users');
  await navigate(dummy, '/connections');
  await evaluate(dummy, `[...document.querySelectorAll('button')].find(button => button.textContent.includes('Received requests')).click()`);
  if (!originalAlex.following.includes(originalDummy.userId)) await button(alex, 'Follow');
  await pause(500);
  if (!originalAlex.connections.includes(originalDummy.userId) && !originalAlex.requested.includes(originalDummy.userId)) {
    await button(alex, 'Connect');
    await until(alex, `document.body.innerText.includes('Request sent')`, 'connection request');
    await until(dummy, `document.body.innerText.includes('@alexdemo')`, 'incoming request');
    await button(dummy, 'Accept');
    await until(dummy, `(async () => (await (await fetch('/api/v1/users/me')).json()).data.connections.includes(${JSON.stringify(originalAlex.userId)}))()`, 'accept request');
    await until(alex, `document.body.innerText.includes('Connected')`, 'live connection acceptance');
  }
  console.log('PASS: discovery, follow and connection acceptance');

  await navigate(dummy, '/profile');
  await navigate(alex, `/profile/${originalDummy.userId}`);
  await until(alex, `!!document.querySelector('[aria-label="Profile statistics"]') && document.body.innerText.includes('Unfollow')`, 'profile follow control');
  const beforeFollow = await api(dummy, '/users/me');
  const stats = followers => `document.querySelector('[aria-label="Profile statistics"]')?.innerText.replace(/\\s+/g, ' ').trim() === ${JSON.stringify(`${followers} followers ${beforeFollow.following.length} following ${beforeFollow.connections.length} connections`)}`;
  await button(alex, 'Unfollow');
  await until(alex, stats(beforeFollow.followers.length - 1), 'viewed profile updates follower count');
  await until(dummy, stats(beforeFollow.followers.length - 1), 'owner sees live follower count');
  await button(alex, 'Follow');
  await until(alex, stats(beforeFollow.followers.length), 'follow restores follower count');
  await until(dummy, stats(beforeFollow.followers.length), 'owner sees restored count');
  console.log('PASS: profile follow/unfollow and live database counts');

  await navigate(dummy, '/groups');
  await button(dummy, 'Create group');
  await fill(dummy, 'input[name="title"]', `Browser group ${stamp}`);
  await fill(dummy, 'textarea[name="description"]', 'Browser group join workflow');
  await button(dummy, 'Create group');
  await until(dummy, `!document.querySelector('input[name="title"]') && document.body.innerText.includes(${JSON.stringify(`Browser group ${stamp}`)})`, 'create group');
  const group = (await api(dummy, '/groups')).find(item => item.title === `Browser group ${stamp}`);
  await navigate(alex, '/groups');
  await until(alex, `!!document.querySelector('a[href="/groups/${group.groupId}"]')`, 'group listing');
  await evaluate(alex, `document.querySelector('a[href="/groups/${group.groupId}"]').closest('article').querySelector('button').click()`);
  await until(alex, `document.querySelector('a[href="/groups/${group.groupId}"]').closest('article').innerText.includes('Request pending')`, 'join request feedback');
  await navigate(alex, `/groups/${group.groupId}`);
  await until(alex, `document.body.innerText.includes('Request pending')`, 'pending request persists on group details');
  await navigate(dummy, `/groups/${group.groupId}`);
  await until(dummy, `document.body.innerText.includes('@alexdemo')`, 'owner receives join request');
  await button(dummy, 'Accept');
  await until(dummy, `document.body.innerText.includes('2 members')`, 'owner accepts join request');
  await navigate(alex, `/groups/${group.groupId}`);
  await until(alex, `document.body.innerText.includes('2 members') && !document.body.innerText.includes('Request pending')`, 'membership persists');
  const detailsGroup = await api(dummy, '/groups', 'POST', { title: `Details group ${stamp}` });
  await navigate(alex, `/groups/${detailsGroup.groupId}`);
  await until(alex, `document.body.innerText.includes('Request to join')`, 'detail join button');
  await button(alex, 'Request to join');
  await until(alex, `document.body.innerText.includes('Request pending')`, 'request from group details');
  console.log('PASS: group creation, join from listing and details, persistent pending state and owner acceptance');

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
  await button(dummy, 'Save changes');
  await until(dummy, `!document.querySelector('[role="dialog"]') && document.body.innerText.includes(${JSON.stringify(`Browser bio ${stamp}`)})`, 'profile save');
  console.log('PASS: story creation and profile editing');

  await navigate(dummy, `/messages/${originalAlex.userId}`);
  await navigate(alex, `/messages/${originalDummy.userId}`);
  await until(dummy, `document.body.innerText.includes('Live updates connected')`, 'dummy WebSocket');
  await until(alex, `document.body.innerText.includes('Live updates connected')`, 'Alex WebSocket');
  await fill(dummy, 'textarea[aria-label="Message"]', `Browser message ${stamp}`);
  await until(alex, `document.body.innerText.includes('is typing')`, 'live typing', 10000);
  await evaluate(dummy, `document.querySelector('textarea[aria-label="Message"]').focus()`);
  await enter(dummy, true);
  assert.equal(await evaluate(dummy, `document.querySelector('textarea[aria-label="Message"]').value`), `Browser message ${stamp}\n`);
  assert(!(await api(dummy, `/messages?partnerId=${originalAlex.userId}`)).messages.some(message => message.textMessage.includes(`Browser message ${stamp}`)), 'Shift+Enter must not send');
  await command('Input.insertText', { text: 'Second line' }, dummy);
  await enter(dummy);
  await until(alex, `document.body.innerText.includes(${JSON.stringify(`Browser message ${stamp}`)})`, 'live message receipt', 10000);
  await until(dummy, `document.body.innerText.includes('read')`, 'message read receipt', 10000);
  const sentMessages = (await api(dummy, `/messages?partnerId=${originalAlex.userId}`)).messages.filter(message => message.textMessage.includes(`Browser message ${stamp}`));
  assert.equal(sentMessages.length, 1);
  assert.equal(sentMessages[0].textMessage, `Browser message ${stamp}\nSecond line`);
  await button(dummy, 'Edit');
  await fill(dummy, 'textarea[aria-label="Message"]', `Edited browser message ${stamp}`);
  await button(dummy, 'Save');
  await until(alex, `document.body.innerText.includes(${JSON.stringify(`Edited browser message ${stamp}`)})`, 'live message edit', 10000);
  await button(alex, 'Delete for me');
  await until(alex, `!document.body.innerText.includes(${JSON.stringify(`Edited browser message ${stamp}`)})`, 'delete for recipient');
  assert(await evaluate(dummy, `document.body.innerText.includes(${JSON.stringify(`Edited browser message ${stamp}`)})`));
  await button(dummy, 'Delete for everyone');
  await until(dummy, `!document.body.innerText.includes(${JSON.stringify(`Edited browser message ${stamp}`)})`, 'delete for everyone');
  console.log('PASS: live typing, messages, read receipts, edits and scoped deletion');

  await api(dummy, '/auth/logout', 'POST');
  await fill(dummy, 'textarea[aria-label="Message"]', 'This unauthorized message must not be sent');
  await button(dummy, 'Send');
  await until(dummy, `location.pathname === '/login' && !!document.querySelector('input[name="identifier"]')`, 'expired session redirects to login');
  await fill(dummy, 'input[name="identifier"]', 'dummy@example.com');
  await fill(dummy, 'input[name="password"]', 'DummyUser123!');
  await evaluate(dummy, `document.querySelector('form').requestSubmit()`);
  await until(dummy, `location.pathname === '/' && !!document.querySelector('aside[aria-label="Main navigation"]')`, 'sign back in after expiry');
  console.log('PASS: API 401 redirects to login and the normal login form restores access');

  await navigate(dummy, '/');
  await until(dummy, `!!document.querySelector('article')`, 'feed ready for scroll');
  await evaluate(dummy, `window.scrollTo(0, document.body.scrollHeight)`);
  const sidebarPosition = await evaluate(dummy, `({ scrollY: window.scrollY, top: document.querySelector('aside[aria-label="Main navigation"]').getBoundingClientRect().top, bodyHeight: document.body.offsetHeight, viewport: window.innerHeight })`);
  assert(sidebarPosition.scrollY > 0 && Math.abs(sidebarPosition.top) < 1, `Sidebar stays at top while the feed scrolls: ${JSON.stringify(sidebarPosition)}`);
  assert(await evaluate(dummy, `document.querySelector('aside img[alt="Social Network"]').naturalWidth > 0`), 'Sidebar logo loads');
  await evaluate(dummy, `window.scrollTo(0, 0)`);
  const screenshot = await command('Page.captureScreenshot', { format: 'png' }, dummy);
  await writeFile(path.join(taskDir, 'frontend.png'), Buffer.from(screenshot.data, 'base64'));
  assert.deepEqual(exceptions, [], 'Browser runtime exceptions');
  console.log('PASS: no browser runtime exceptions');
} finally {
  if (dummy && originalDummy) {
    if (postId) await api(dummy, `/posts?id=${postId}`, 'DELETE').catch(() => {});
    if (storyId) await api(dummy, `/stories/${storyId}`, 'DELETE').catch(() => {});
    await api(dummy, '/users/me', 'PUT', originalDummy).catch(() => {});
    if (originalAlex && !originalDummy.connections.includes(originalAlex.userId)) await api(dummy, `/connections/${originalAlex.userId}`, 'DELETE').catch(() => {});
  }
  if (alex && originalAlex && originalDummy && !originalAlex.following.includes(originalDummy.userId)) await api(alex, `/users/${originalDummy.userId}/follow`, 'DELETE').catch(() => {});
  await writeFile(path.join(taskDir, 'result.json'), JSON.stringify({ postId, storyId, mediaURL, exceptions, failedResponses }, null, 2));
  await command('Browser.close').catch(() => {});
  socket.close();
  browser.kill();
}
