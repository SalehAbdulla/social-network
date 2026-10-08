import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

function crc32(buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

function largePng(width, height) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  const raw = Buffer.alloc(height * (1 + width * 3));
  let at = 0;
  for (let y = 0; y < height; y++) {
    raw[at++] = 0;
    for (let x = 0; x < width; x++) {
      raw[at++] = (x + y) & 0xFF;
      raw[at++] = (x * 2) & 0xFF;
      raw[at++] = (y * 2) & 0xFF;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const base = process.env.BASE_URL || 'http://localhost:4000';
const taskDir = process.env.TEST_ARTIFACT_DIR || path.resolve('../backend/tmp/browser-check');
await mkdir(taskDir, { recursive: true });
const browserProfile = path.join(taskDir, `profile-${Date.now()}`);
await mkdir(browserProfile);
const chrome = [
  process.env.CHROME_PATH,
  ...(process.platform === 'win32'
    ? ['C:/Program Files/Google/Chrome/Application/chrome.exe']
    : process.platform === 'darwin'
      ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium']
      : []),
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean).find(candidate => existsSync(candidate));
assert(chrome, 'No Chrome found. Set CHROME_PATH to the browser executable.');
const browser = spawn(chrome, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${browserProfile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let browserError;
browser.on('error', error => { browserError = error; });
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let port;
for (let i = 0; i < 100; i++) {
  if (browserError) throw browserError;
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
const responsesByPage = new Map();
const requestsMatching = (page, fragment) => (responsesByPage.get(page) || []).filter(url => url.includes(fragment));
const requestsTo = (page, fragment) => requestsMatching(page, fragment).length;
const consoleErrors = [];
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
      } catch {  }
    }
  }
  if (event.method === 'Runtime.consoleAPICalled' && event.params.type === 'error') {
    consoleErrors.push(event.params.args.map(argument => argument.value ?? argument.description ?? '').join(' '));
  }
  if (event.method === 'Network.responseReceived' && event.params.response.url.startsWith(base)) {
    const seen = responsesByPage.get(event.sessionId) || [];
    seen.push(event.params.response.url);
    responsesByPage.set(event.sessionId, seen);
    if (event.params.response.status >= 400) {
      failedResponses.push({ url: event.params.response.url, status: event.params.response.status });
    }
  }
  if (event.method === 'Fetch.requestPaused') {
    if (new URL(event.params.request.url).hostname === 'fonts.googleapis.com') {
      await command('Fetch.fulfillRequest', { requestId: event.params.requestId, responseCode: 200, responseHeaders: [{ name: 'Content-Type', value: 'text/css' }], body: '' }, event.sessionId);
      return;
    }
    if (holdGroupRefresh && event.params.request.method === 'GET' && new URL(event.params.request.url).pathname === '/api/v1/groups') {
      heldGroupRequests.push(event); return;
    }
    const local = event.params.request.url.startsWith(base + '/') || event.params.request.url.startsWith('data:') || event.params.request.url.startsWith('blob:');
    try { await command(local ? 'Fetch.continueRequest' : 'Fetch.failRequest', local ? { requestId: event.params.requestId } : { requestId: event.params.requestId, errorReason: 'BlockedByClient' }, event.sessionId); } catch {  }
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

  await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);
  await command('Page.navigate', { url: base + '/login' }, sessionId);
  await until(sessionId, `!!document.querySelector('input[name="identifier"]')`, 'login form');
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
async function postMenu(page, label) {
  await evaluate(page, `document.querySelector('[aria-label="Post options"]').click()`);
  await until(page, `!!document.querySelector('[role="menuitem"]')`, 'the post options menu opens');
  await evaluate(page, `(() => { const item = [...document.querySelectorAll('[role="menuitem"]')].find(node => node.textContent.trim() === ${JSON.stringify(label)}); if (!item) throw new Error('Menu item not found: ' + ${JSON.stringify(label)}); item.click(); })()`);
}
async function settingsItem(page, label) {
  await until(page, `!!document.querySelector('[aria-label="Options"]')`, 'the profile settings gear');
  await evaluate(page, `document.querySelector('[aria-label="Options"]').click()`);
  await until(page, `!!document.querySelector('[role="menuitem"]')`, 'the settings menu opens');
  await evaluate(page, `(() => { const item = [...document.querySelectorAll('[role="menuitem"]')].find(node => node.textContent.trim() === ${JSON.stringify(label)}); if (!item) throw new Error('Menu item not found: ' + ${JSON.stringify(label)}); item.click(); })()`);
}

async function buttonThen(page, text, expression, label, timeout = 60000) {
  const end = Date.now() + timeout;
  let clicks = 0;
  while (Date.now() < end) {
    if (await evaluate(page, expression)) return clicks;
    try {
      await button(page, text);
      clicks += 1;
    } catch {
      break;
    }
    await pause(500);
  }
  await until(page, expression, label, Math.max(1000, end - Date.now()));
  return clicks;
}
async function resetTokenFromLog(logPath, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const text = await readFile(logPath, 'utf8');
      const matches = [...text.matchAll(/\/reset\?token=([A-Za-z0-9_-]{20,})/g)];
      if (matches.length) return matches[matches.length - 1][1];
    } catch {  }
    await pause(200);
  }
  throw new Error(`No reset link reached ${logPath}`);
}
async function enter(page, shift = false) {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', modifiers: shift ? 8 : 0 }, page);
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: shift ? 8 : 0 }, page);
}
async function enterWithControl(page) {
  const modifiers = 2;
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', modifiers }, page);
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers }, page);
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
  for (const route of ['/', '/saved', '/search', '/hashtag/travel', '/u/dummyuser', '/post/1', '/post/1/edit', '/profile', '/profile/someone', '/messages', '/messages/someone', '/groups', '/groups/1', '/connections', '/discover', '/notifications', '/create-post', '/CreatePost', '/missing-page']) {
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

  await until(dummy, `!!document.querySelector('section[aria-label="Suggested for you"]')`, 'the feed offers people to follow', 15000);
  const findFollow = `[...document.querySelectorAll('section[aria-label="Suggested for you"] button')].find(candidate => candidate.textContent === 'Follow')`;
  assert(await evaluate(dummy, `!!(${findFollow})`), 'the rail offers a person to follow');
  const offeredId = await evaluate(dummy, `(() => { const row = (${findFollow}).closest('li'); const link = row.querySelector('a[href^="/profile/"]'); return link ? link.getAttribute('href').split('/').pop() : null; })()`);
  assert(offeredId, 'the suggested row links to the person it offers');
  const offeredProfile = await api(dummy, `/users/${offeredId}`);
  const offeredRow = state => `(() => { const link = document.querySelector('section[aria-label="Suggested for you"] a[href$="/profile/${offeredId}"]'); return !!link && link.closest('li').innerText.includes(${JSON.stringify(state)}); })()`;
  await evaluate(dummy, `(${findFollow}).click()`);
  const expected = offeredProfile.isPublic ? 'Following' : 'Requested';
  await until(dummy, offeredRow(expected), `the acted row switches to ${expected}`);
  if (offeredProfile.isPublic) assert(await evaluate(dummy, `(async () => (await (await fetch('/api/v1/users/me')).json()).data.following.includes(${JSON.stringify(offeredId)}))()`), 'following from the rail must reach the account');
  else assert((await api(dummy, `/users/${offeredId}`)).pendingOutgoing === true, 'a private suggestion must leave a pending request');
  await api(dummy, `/users/${offeredId}/follow`, 'DELETE');
  await navigate(dummy, '/');
  await until(dummy, `(() => { const link = document.querySelector('section[aria-label="Suggested for you"] a[href$="/profile/${offeredId}"]'); return !!link && link.closest('li').innerText.includes('Follow') && !link.closest('li').innerText.includes('Following') && !link.closest('li').innerText.includes('Requested'); })()`, 'unfollowing offers the member again');
  console.log('PASS: the feed suggests people to follow, and acting on one settles the row');

  await navigate(dummy, '/create-post');
  await fill(dummy, 'textarea', `Persisted browser integration test ${stamp}`);
  const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
  const fixture = path.join(taskDir, 'pixel.png');
  const secondFixture = path.join(taskDir, 'pixel-2.png');
  await writeFile(fixture, Buffer.from(pixel, 'base64'));
  await writeFile(secondFixture, Buffer.from(pixel, 'base64'));
  const document = await command('DOM.getDocument', {}, dummy);
  const fileNode = await command('DOM.querySelector', { nodeId: document.root.nodeId, selector: 'input[type="file"]' }, dummy);
  await command('DOM.setFileInputFiles', { nodeId: fileNode.nodeId, files: [fixture, secondFixture] }, dummy);
  await until(dummy, `!!document.querySelector('img[alt="Preview of pixel.png"]')`, 'image preview');
  await until(dummy, `!!document.querySelector('img[alt="Preview of pixel-2.png"]')`, 'second image preview');
  const tileDetails = await evaluate(dummy, `(() => { const tile = document.querySelector('img[alt="Preview of pixel.png"]').closest('div'); const caption = tile && tile.querySelector('span'); return caption && caption.textContent.trim(); })()`);
  assert(/^\d+ × \d+ · \d+ B$/.test(String(tileDetails)), `the picker must show the file's dimensions and size, got ${JSON.stringify(tileDetails)}`);
  await button(dummy, 'Publish Post');
  await until(dummy, `location.pathname === '/' && document.body.innerText.includes(${JSON.stringify(`Persisted browser integration test ${stamp}`)})`, 'publish post');
  const created = (await api(dummy, '/posts')).posts.find(post => post.content === `Persisted browser integration test ${stamp}`);
  assert(created); postId = created.postId; mediaURL = created.imageUrls[0]; assert(mediaURL);
  await navigate(dummy, `/post/${postId}`);
  await until(dummy, `!!document.querySelector('button[aria-label="Like post"]')`, 'post details');
  await evaluate(dummy, `document.querySelector('button[aria-label="Like post"]').click()`);
  await until(dummy, `(async () => (await (await fetch('/api/v1/post?id=${postId}')).json()).data.score === 1)()`, 'post reaction');
  console.log('PASS: post creation, image upload, detail page and reaction persist');

  await navigate(dummy, '/');
  await evaluate(dummy, `document.querySelector('button[aria-label="Create"]').click()`);
  await until(dummy, `!!document.querySelector('[role="menu"][aria-label="Create"] [role="menuitem"]')`, 'the rail opens its create menu');
  await evaluate(dummy, `document.querySelector('[role="menu"][aria-label="Create"] [role="menuitem"]').click()`);
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Create a post"] textarea')`, 'the sidebar opens the composer dialog');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, dummy);
  await until(dummy, `!document.querySelector('[role="dialog"][aria-label="Create a post"]')`, 'Escape closes the composer');
  console.log('PASS: the sidebar opens the composer as a dialog and Escape closes it');

  await navigate(dummy, '/create-post');
  const cropFixture = path.join(taskDir, 'crop-fixture.png');
  await writeFile(cropFixture, largePng(600, 900));
  const cropDocument = await command('DOM.getDocument', {}, dummy);
  const cropInput = await command('DOM.querySelector', { nodeId: cropDocument.root.nodeId, selector: 'input[type="file"]' }, dummy);
  await command('DOM.setFileInputFiles', { nodeId: cropInput.nodeId, files: [cropFixture] }, dummy);
  await until(dummy, `!!document.querySelector('img[alt="Preview of crop-fixture.png"]')`, 'crop fixture preview');
  const beforeCrop = await evaluate(dummy, `(() => { const tile = document.querySelector('img[alt="Preview of crop-fixture.png"]').closest('div'); return tile.querySelector('span').textContent.trim(); })()`);
  assert(/^600 × 900 /.test(beforeCrop), `the crop fixture must start portrait, got ${JSON.stringify(beforeCrop)}`);
  await clickAt(dummy, 'button[aria-label="Crop crop-fixture.png"]');
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Crop photo"]')`, 'the crop dialog opens');
  await button(dummy, 'Apply crop');
  await until(dummy, `(() => { const tile = document.querySelector('img[alt="Preview of crop-fixture.png"]')?.closest('div'); const caption = tile && tile.querySelector('span'); return caption && /^600 × 600 /.test(caption.textContent.trim()); })()`, 'the crop changed the file to a square');
  console.log('PASS: a photo is cropped to a square in the browser before it is uploaded');

  await navigate(dummy, `/post/${postId}`);
  await until(dummy, `!!document.querySelector('[aria-label="Post options"]')`, 'the post page is loaded again');

  for (let attempt = 0; attempt < 40 && requestsMatching(dummy, mediaURL).length === 0; attempt++) await pause(250);
  const mediaRequests = requestsMatching(dummy, mediaURL);
  assert(mediaRequests.length > 0, 'the post picture should have been requested');
  assert(mediaRequests.every(url => url.includes('?size=')), `every request for the picture must name a size, got ${JSON.stringify(mediaRequests)}`);
  console.log('PASS: the picture is fetched through a sized variant, never as the bare original');

  await postMenu(dummy, 'Edit');
  await until(dummy, `document.querySelector('h1')?.textContent === 'Edit Post' && !!document.querySelector('img[alt="Photo 1"]')`, 'prefilled post editor');
  assert.equal(await evaluate(dummy, `document.querySelector('textarea').value`), created.content, 'the editor is prefilled with the post text');
  await fill(dummy, 'textarea', 'Cancelled edit');
  await evaluate(dummy, `[...document.querySelectorAll('main a')].find(link => link.textContent === 'Cancel').click()`);
  await until(dummy, `location.pathname === '/post/${postId}' && !!document.querySelector('[aria-label="Post options"]')`, 'cancel edit');
  assert.equal((await api(dummy, `/post?id=${postId}`)).content, created.content);
  await postMenu(dummy, 'Edit');
  await until(dummy, `document.querySelector('h1')?.textContent === 'Edit Post'`, 'reopen editor');
  await fill(dummy, 'textarea', `Updated browser post content ${stamp}`);
  await button(dummy, 'Save changes');
  await until(dummy, `location.pathname === '/post/${postId}' && document.body.innerText.includes(${JSON.stringify(`Updated browser post content ${stamp}`)})`, 'saved post');
  const edited = await api(dummy, `/post?id=${postId}`);
  assert.equal(edited.content, `Updated browser post content ${stamp}`);
  assert.deepEqual(edited.imageUrls, created.imageUrls);
  assert.equal(edited.score, 1);
  console.log('PASS: owner edit button, prefilled editor, cancel and save preserve photos and votes');

  await until(dummy, `!!document.querySelector('button[aria-label="Open image 1 of 2"]')`, 'photos open in a viewer');
  await clickAt(dummy, 'button[aria-label="Open image 1 of 2"]');
  await until(dummy, `document.activeElement?.getAttribute('aria-label') === 'Post photos viewer'`, 'the viewer takes focus');
  assert.equal(await evaluate(dummy, `document.querySelector('[role="dialog"] img').getAttribute('src')`), `${mediaURL}?size=large`, 'the viewer asks for the large derivative');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 }, dummy);
  await until(dummy, `document.querySelector('[role="dialog"] img').getAttribute('alt') === 'Post photos 2 of 2'`, 'the arrow key advances');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowLeft', code: 'ArrowLeft', windowsVirtualKeyCode: 37 }, dummy);
  await until(dummy, `document.querySelector('[role="dialog"] img').getAttribute('alt') === 'Post photos 1 of 2'`, 'the arrow key goes back');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, dummy);
  await until(dummy, `!document.querySelector('[role="dialog"][aria-label="Post photos viewer"]')`, 'Escape closes the viewer');
  await until(dummy, `document.activeElement?.getAttribute('aria-label') === 'Open image 1 of 2'`, 'focus returns to the picture it was opened from');
  console.log('PASS: a photo opens in a lightbox, moves with the arrow keys and closes on Escape');

  await until(dummy, `!!document.querySelector('button[aria-label="Save post"]')`, 'the save control is on the post');
  await evaluate(dummy, `document.querySelector('button[aria-label="Save post"]').click()`);
  await until(dummy, `(async () => (await (await fetch('/api/v1/saved-posts?page=1&size=10')).json()).data.posts.some(post => post.postId === ${JSON.stringify(postId)}))()`, 'the post reaches the saved list');
  await until(dummy, `!!document.querySelector('button[aria-label="Remove from saved"]')`, 'the control reflects the saved state');
  await navigate(dummy, '/saved');
  await until(dummy, `document.body.innerText.includes(${JSON.stringify(`Updated browser post content ${stamp}`)})`, 'the saved page lists the bookmarked post');
  await evaluate(dummy, `document.querySelector('button[aria-label="Remove from saved"]').click()`);
  await until(dummy, `!document.body.innerText.includes(${JSON.stringify(`Updated browser post content ${stamp}`)})`, 'un-saving drops the row');
  assert.equal(await evaluate(dummy, `(async () => (await (await fetch('/api/v1/saved-posts?page=1&size=10')).json()).data.totalElements)()`), 0, 'the saved list is empty after un-saving');
  console.log('PASS: a post is saved from its card, listed on the private Saved page, and dropped when un-saved');

  const draftKey = 'social:post-draft';
  await navigate(dummy, '/create-post');
  await until(dummy, `document.querySelector('[aria-label="Audience"]')?.innerText.includes('Visible to everyone')`, 'a public post on a public profile reaches everyone');
  await fill(dummy, 'main select', 'followers');
  await until(dummy, `document.querySelector('[aria-label="Audience"]')?.innerText.includes('Visible to your followers')`, 'the banner follows the audience the draft chooses');
  await fill(dummy, 'main select', 'public');
  await fill(dummy, 'textarea', 'Too short');
  await until(dummy, `!!document.getElementById('publish-blocked')`, 'the composer names what is missing');
  const blockedReason = await evaluate(dummy, `document.getElementById('publish-blocked').textContent`);
  assert(/Add \d+ more character/.test(blockedReason), `the composer must say how much is missing, got ${JSON.stringify(blockedReason)}`);
  assert.equal(await evaluate(dummy, `document.querySelector('textarea').getAttribute('aria-describedby')`), 'publish-blocked', 'the reason belongs to the field it is about');
  assert(await evaluate(dummy, `!!document.querySelector('button[title*="Ctrl/Cmd"]')`), 'the shortcut is discoverable on the publish button');
  await fill(dummy, 'textarea', `Draft ${stamp} of the description`);
  await until(dummy, `(localStorage.getItem(${JSON.stringify(draftKey)}) || '').includes(${JSON.stringify(`Draft ${stamp}`)})`, 'the draft reaches storage');
  await command('Page.navigate', { url: base + '/create-post' }, dummy);
  await until(dummy, `!!document.getElementById('draft-restored')`, 'the draft is offered back after a reload');
  assert.equal(await evaluate(dummy, `document.querySelector('textarea').value`), `Draft ${stamp} of the description`, 'the restored draft is the text that was typed');
  assert(await evaluate(dummy, `!document.querySelector('img[alt^="Preview of"]')`), 'photos cannot survive a reload and must not be implied to');
  await button(dummy, 'Discard draft');
  await until(dummy, `!document.getElementById('draft-restored')`, 'discarding removes the notice');
  assert.equal(await evaluate(dummy, `document.querySelector('textarea').value`), '', 'discarding empties the composer');
  assert.equal(await evaluate(dummy, `localStorage.getItem(${JSON.stringify(draftKey)})`), null, 'discarding clears the stored draft');

  await fill(dummy, 'textarea', `Composed with the keyboard ${stamp}`);
  await until(dummy, `!document.getElementById('publish-blocked')`, 'nothing blocks this publish any more');
  await evaluate(dummy, `document.querySelector('textarea').focus()`);
  await enterWithControl(dummy);
  await until(dummy, `location.pathname === '/' && document.body.innerText.includes(${JSON.stringify(`Composed with the keyboard ${stamp}`)})`, 'Ctrl+Enter publishes from the textarea');
  assert.equal(await evaluate(dummy, `localStorage.getItem(${JSON.stringify(draftKey)})`), null, 'publishing clears the draft');
  const composed = (await api(dummy, '/posts')).posts.find(post => post.content === `Composed with the keyboard ${stamp}`);
  assert(composed, 'the post published with the keyboard must exist');
  await api(dummy, `/posts?id=${composed.postId}`, 'DELETE');
  console.log('PASS: the composer says what is missing, keeps a draft across a reload, and publishes on Ctrl/Cmd+Enter');

  const largeFixture = path.join(taskDir, 'large.png');
  await writeFile(largeFixture, largePng(2000, 1500));
  await navigate(dummy, '/create-post');
  await fill(dummy, 'textarea', `Downscaled upload ${stamp}`);
  const largeDocument = await command('DOM.getDocument', {}, dummy);
  const largeNode = await command('DOM.querySelector', { nodeId: largeDocument.root.nodeId, selector: 'input[type="file"]' }, dummy);
  await command('DOM.setFileInputFiles', { nodeId: largeNode.nodeId, files: [largeFixture] }, dummy);
  await until(dummy, `!!document.querySelector('img[alt="Preview of large.png"]')`, 'the large photo is attached');
  await button(dummy, 'Publish Post');
  await until(dummy, `location.pathname === '/' && document.body.innerText.includes(${JSON.stringify(`Downscaled upload ${stamp}`)})`, 'the large photo publishes');
  const largePost = (await api(dummy, '/posts')).posts.find(post => post.content === `Downscaled upload ${stamp}`);
  assert(largePost && largePost.imageUrls.length === 1, `the downscaled post carries its photo: ${JSON.stringify(largePost)}`);
  const stored = await evaluate(dummy, `(async () => { const image = new Image(); image.src = ${JSON.stringify(largePost.imageUrls[0])}; await image.decode(); return { width: image.naturalWidth, height: image.naturalHeight }; })()`);
  assert.equal(stored.width, 1600, `a 2000 px upload must be stored at the cap, got ${JSON.stringify(stored)}`);
  assert.equal(stored.height, 1200, `the aspect ratio must survive the shrink, got ${JSON.stringify(stored)}`);
  await api(dummy, `/posts?id=${largePost.postId}`, 'DELETE');
  console.log('PASS: a photo above the cap is downscaled in the browser before it is uploaded');

  const tag = `rebootcheck${stamp}`;
  await navigate(dummy, '/create-post');
  await fill(dummy, 'textarea', `A tagged post #${tag} that mentions @alexdemo too.`);
  await button(dummy, 'Publish Post');
  await until(dummy, `location.pathname === '/' && !!document.querySelector('a[href="/hashtag/${tag}"]')`, 'the tag is a link on the card');
  assert(await evaluate(dummy, `!!document.querySelector('a[href="/u/alexdemo"]')`), 'the mention is a link on the card');
  await evaluate(dummy, `document.querySelector('a[href="/hashtag/${tag}"]').click()`);
  await until(dummy, `location.pathname === '/hashtag/${tag}' && document.body.innerText.includes(${JSON.stringify(`A tagged post #${tag}`)})`, 'the tag page lists its post');
  await navigate(dummy, '/');
  await until(dummy, `!!document.querySelector('a[href="/u/alexdemo"]')`, 'the mention is on the feed');
  await evaluate(dummy, `document.querySelector('a[href="/u/alexdemo"]').click()`);
  await until(dummy, `location.pathname.startsWith('/profile/') && document.body.innerText.includes('@alexdemo')`, 'the mention opens the member it names');
  console.log('PASS: a hashtag opens its results page and a mention opens the member it names');

  alex = await createPage('alex@example.com');
  await navigate(alex, '/');
  originalAlex = await api(alex, '/users/me');
  await navigate(alex, '/messages');
  await until(alex, `document.querySelector('aside[aria-label="Conversations"]').innerText.includes('Your conversations will appear here')`, 'empty inbox excludes unrelated users');
  assert.equal((await api(alex, '/messages/users')).length, 0);
  assert(await evaluate(alex, `!!document.querySelector('button[aria-label="New message"]')`));
  await navigate(alex, `/post/${postId}`);
  await until(alex, `!!document.querySelector('button[aria-label="Like post"]')`, 'other author post');
  await evaluate(alex, `document.querySelector('[aria-label="Post options"]').click()`);
  await until(alex, `!!document.querySelector('[role="menuitem"]')`, 'the post menu opens');
  assert(!(await evaluate(alex, `[...document.querySelectorAll('[role="menuitem"]')].some(item => ['Edit', 'Delete'].includes(item.textContent.trim()))`)), 'a non-owner is offered no Edit or Delete');
  await evaluate(alex, `document.querySelector('[aria-label="Post options"]').click()`);
  await navigate(alex, `/post/${postId}/edit`);
  await until(alex, `document.body.innerText.includes('You can only edit your own posts.')`, 'non-owner editor denied');
  assert(!(await evaluate(alex, `!!document.querySelector('textarea')`)), 'the editor is not offered to a non-owner');
  await navigate(alex, `/post/${postId}`);
  await until(alex, `!!document.querySelector('article')`, 'Alex post details');
  await navigate(dummy, `/post/${postId}`);
  await until(dummy, `!!document.querySelector('section[aria-label="Post insights"]')`, 'the author sees the insights panel');
  const insightsText = await evaluate(dummy, `document.querySelector('section[aria-label="Post insights"]').innerText`);
  assert(/Reach:\s*[0-9]+/.test(insightsText), `the panel reports a reach number: ${JSON.stringify(insightsText)}`);
  assert(/Reactions:\s*[0-9]+/.test(insightsText), `the panel reports a reaction total: ${JSON.stringify(insightsText)}`);
  assert(!(await evaluate(alex, `!!document.querySelector('section[aria-label="Post insights"]')`)), 'insights are not offered to anyone but the author');
  assert.equal(await evaluate(alex, `(async () => (await fetch('/api/v1/posts/${postId}/insights')).status)()`), 403, 'the insights endpoint refuses a non-author');
  console.log("PASS: a post's insights belong to its author alone");
  assert(await evaluate(alex, `!!document.querySelector('#comment-${postId}')`), 'Post comments open by default');
  await fill(alex, `#comment-${postId}`, `Browser comment ${stamp}`);
  await evaluate(alex, `document.querySelector('.pv-post').click()`);
  await until(alex, `document.body.innerText.includes(${JSON.stringify(`Browser comment ${stamp}`)}) && document.querySelector('textarea').value === ''`, 'comment creation');
  await fill(alex, `#comment-${postId}`, 'Draft preserved while voting');
  await evaluate(alex, `window.commentRow = document.querySelector('[aria-label="Like comment"], [aria-label="Unlike comment"]').closest('.pv-cmt'); performance.clearResourceTimings()`);
  await evaluate(alex, `document.querySelector('[aria-label="Like comment"]').click()`);
  await until(alex, `!!document.querySelector('[aria-label="Unlike comment"]') && window.commentRow.innerText.includes('1 like')`, 'the comment is liked');
  assert(await evaluate(alex, `window.commentRow === document.querySelector('[aria-label="Unlike comment"]').closest('.pv-cmt') && document.querySelector('textarea').value === 'Draft preserved while voting'`), 'liking must keep the draft and the row');
  await evaluate(alex, `document.querySelector('[aria-label="Unlike comment"]').click()`);
  await until(alex, `!!document.querySelector('[aria-label="Like comment"]') && !window.commentRow.innerText.includes('1 like')`, 'the comment like is removed');
  const refetchedWhileVoting = await evaluate(alex, `performance.getEntriesByType('resource').map(entry => entry.name).filter(name => name.includes('/api/v1/post') || name.includes('/api/v1/reaction'))`);
  assert.deepEqual(refetchedWhileVoting, [], `Comment liking must not refetch the post or comments: ${JSON.stringify(refetchedWhileVoting)}`);
  console.log('PASS: comment likes toggle in place without refetching or losing the draft');

  const commentPhotoFixture = path.join(taskDir, 'comment-photo.png');
  await writeFile(commentPhotoFixture, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64'));
  const commentDocument = await command('DOM.getDocument', {}, alex);
  const commentPicker = await command('DOM.querySelector', { nodeId: commentDocument.root.nodeId, selector: 'input[aria-label="Add photos"]' }, alex);
  await command('DOM.setFileInputFiles', { nodeId: commentPicker.nodeId, files: [commentPhotoFixture] }, alex);
  await until(alex, `!!document.querySelector('img[alt="comment-photo.png"]')`, 'comment photo preview');
  await fill(alex, `#comment-${postId}`, `Browser comment with a photo ${stamp}`);
  await evaluate(alex, `document.querySelector('.pv-post').click()`);
  await until(alex, `!!document.querySelector('img[alt="Comment attachment"]')`, 'comment photo renders');
  const photoComment = (await api(alex, `/posts/comments?postId=${postId}`)).comments.find(item => item.commentText === `Browser comment with a photo ${stamp}`);
  assert(photoComment && photoComment.imageUrls.length === 1, `the comment kept its photo: ${JSON.stringify(photoComment)}`);
  const commentPhoto = photoComment.imageUrls[0];
  assert(await evaluate(alex, `(async () => (await fetch(${JSON.stringify(commentPhoto)})).ok)()`), 'the uploaded comment photo is served');
  const freshComment = await evaluate(alex, `(() => {
    const node = [...document.querySelectorAll('article time[datetime]')].find(item => item.textContent.trim().length > 0);
    return node ? { text: node.textContent.trim(), title: node.getAttribute('title'), dateTime: node.getAttribute('datetime') } : null;
  })()`);
  assert(freshComment && /ago|now|yesterday/i.test(freshComment.text), `a freshly written item reads as relative: ${JSON.stringify(freshComment)}`);
  assert(freshComment.dateTime && freshComment.title, `the exact instant stays on the element: ${JSON.stringify(freshComment)}`);
  console.log('PASS: a comment carries an uploaded photo, renders it and stores its URL');

  await navigate(dummy, '/');
  await navigate(alex, '/');
  await until(alex, `!!document.querySelector('[aria-label="Your account"]')`, 'the second account is on the feed');
  const socketPosts = [];
  for (let attempt = 0; attempt < 5; attempt++) {
    const posted = await api(alex, '/posts', 'POST', { title: `Socket ${stamp}`, content: `Socket post ${stamp}`, imageUrls: [], privacy: 'public', selectedFollowerIds: [] });
    socketPosts.push(posted.postId);
    await pause(1000);
    if (await evaluate(dummy, `!!document.querySelector('button[aria-label="Show new posts"]')`)) break;
  }
  assert(!(await evaluate(alex, `!!document.querySelector('button[aria-label="Show new posts"]')`)), 'the author must not be offered a reload of the post they just wrote');
  await until(dummy, `!!document.querySelector('button[aria-label="Show new posts"]')`, 'the feed offers the post that arrived over the socket');
  await evaluate(dummy, `document.querySelector('button[aria-label="Show new posts"]').click()`);
  await until(dummy, `document.body.innerText.includes(${JSON.stringify(`Socket post ${stamp}`)})`, 'the pill folds the new page in');
  assert(!(await evaluate(dummy, `!!document.querySelector('button[aria-label="Show new posts"]')`)), 'the pill goes once it has been pressed');
  for (const id of socketPosts) await api(alex, `/posts?id=${id}`, 'DELETE');
  console.log('PASS: a post created elsewhere raises a "New posts" pill instead of replacing the feed');

  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, alex);
  await navigate(alex, `/post/${postId}`);
  await until(alex, `!!document.querySelector('button[aria-label="Show comments"]')`, 'comment button on a phone');
  assert(!(await evaluate(alex, `!!document.querySelector('#comment-${postId}')`)), 'comments are not inline on a phone');
  await evaluate(alex, `document.querySelector('button[aria-label="Show comments"]').click()`);
  await until(alex, `!!document.querySelector('[role="dialog"][aria-label="Comments"]')`, 'the comment drawer opens');
  assert(await evaluate(alex, `!!document.querySelector('[role="dialog"][aria-label="Comments"] #comment-${postId}')`), 'the drawer holds the composer');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, alex);
  await until(alex, `!document.querySelector('[role="dialog"][aria-label="Comments"]')`, 'Escape closes the drawer');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, alex);
  console.log('PASS: on a phone the comments open as a bottom drawer and close on Escape');

  await navigate(dummy, '/');
  const feedMedia = `article[data-post-id="${postId}"] button[aria-label^="Open image"]`;
  await until(dummy, `!!document.querySelector(${JSON.stringify(feedMedia)})`, 'the post is on the feed with its media');
  await clickAt(dummy, feedMedia);
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Post"]')`, 'the feed opens the post overlay');
  assert(await evaluate(dummy, `(() => { const dialog = document.querySelector('[role="dialog"][aria-label="Post"]'); return !!dialog.querySelector('img[alt^="Photo by"]') && !!dialog.querySelector('#comment-${postId}') && !!dialog.querySelector('button[aria-label="Like post"], button[aria-label="Unlike post"]'); })()`), 'the overlay holds the media, the composer and the post actions');
  const overlayDocument = await command('DOM.getDocument', {}, dummy);
  const overlayPicker = await command('DOM.querySelector', { nodeId: overlayDocument.root.nodeId, selector: '[role="dialog"][aria-label="Post"] input[aria-label="Add photos"]' }, dummy);
  await command('DOM.setFileInputFiles', { nodeId: overlayPicker.nodeId, files: [commentPhotoFixture] }, dummy);
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Post"] img[alt="comment-photo.png"]')`, 'the overlay previews a comment photo');
  await fill(dummy, `[role="dialog"][aria-label="Post"] #comment-${postId}`, `Overlay comment ${stamp}`);
  await evaluate(dummy, `[...document.querySelectorAll('[role="dialog"][aria-label="Post"] button')].find(button => button.textContent.trim() === 'Post').click()`);
  await until(dummy, `document.querySelector('[role="dialog"][aria-label="Post"]').innerText.includes(${JSON.stringify(`Overlay comment ${stamp}`)})`, 'the overlay shows the comment it wrote');
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Post"] img[alt="Comment attachment"]')`, 'the overlay renders the comment photo');
  const overlayComment = (await api(dummy, `/posts/comments?postId=${postId}`)).comments.find(item => item.commentText === `Overlay comment ${stamp}`);
  assert(overlayComment && overlayComment.imageUrls.length === 1, `the overlay comment is stored with its photo: ${JSON.stringify(overlayComment)}`);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, dummy);
  await until(dummy, `!document.querySelector('[role="dialog"][aria-label="Post"]')`, 'Escape closes the overlay');
  assert(await evaluate(dummy, `document.activeElement?.getAttribute('aria-label')?.startsWith('Open image')`), 'focus returns to the picture that opened the overlay');
  console.log('PASS: the feed opens a post overlay that reads and writes a comment photo, and Escape returns focus');

  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, dummy);
  await navigate(dummy, '/');
  const feedComments = `article[data-post-id="${postId}"] button[aria-label="Show comments"]`;
  await until(dummy, `!!document.querySelector(${JSON.stringify(feedComments)})`, 'the feed card offers the comment button on a phone');
  assert(!(await evaluate(dummy, `!!document.querySelector('[role="dialog"][aria-label="Post"]')`)), 'no overlay is offered on a phone');
  await evaluate(dummy, `document.querySelector(${JSON.stringify(feedComments)}).click()`);
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Comments"] #comment-${postId}')`, 'the phone feed opens the comment drawer');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, dummy);
  await until(dummy, `!document.querySelector('[role="dialog"][aria-label="Comments"]')`, 'Escape closes the drawer');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, dummy);
  console.log('PASS: on a phone the feed opens the comment drawer, not the overlay');

  await navigate(alex, '/profile');
  await until(alex, `!!document.querySelector('[aria-label="Profile statistics"]')`, 'own profile');
  const ownProfileData = await api(alex, '/users/me');
  const shownPostCount = await evaluate(alex, `Number((document.querySelector('[aria-label="Post count"]')?.innerText.match(/[0-9]+/) || [NaN])[0])`);
  assert.equal(shownPostCount, ownProfileData.postCount, `the header shows the profile's own post count: ${shownPostCount} vs ${ownProfileData.postCount}`);
  await evaluate(alex, `document.querySelector('[data-tab="media"]').click()`);
  await until(alex, `[...document.querySelectorAll('a[href="/post/${postId}"] img')].some(image => { const src = image.getAttribute('src') || ''; return src.startsWith(${JSON.stringify(commentPhoto)}) && src.includes('size='); })`, 'comment photo in the profile media tab');
  const mediaGrid = await evaluate(alex, `(() => { const grid = document.querySelector('[data-media-grid]'); const tile = grid.querySelector('img'); const box = tile.getBoundingClientRect(); return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, ratio: box.width / box.height, width: Math.round(box.width) }; })()`);
  assert.equal(mediaGrid.columns, 3, `the media grid is three columns: ${JSON.stringify(mediaGrid)}`);
  assert(Math.abs(mediaGrid.ratio - 3 / 4) < 0.02, `the media tiles are 3:4 portrait: ${JSON.stringify(mediaGrid)}`);
  console.log('PASS: the profile header counts posts and the media tab is a three-column portrait grid');
  console.log('PASS: the profile media tab lists the comment photo');

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
  await until(alex, `!!document.querySelector('input[aria-label="Search people"]') && document.querySelector('main').innerText.includes('@dummyuser')`, 'discover users');
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

  const commentsBeforeAudienceEdit = (await api(dummy, `/post?id=${postId}`)).commentsCounter;
  await navigate(dummy, `/post/${postId}/edit`);
  await until(dummy, `document.querySelector('h1')?.textContent === 'Edit Post'`, 'edit audience');
  await fill(dummy, 'main select', 'selected');
  await until(dummy, `!!document.querySelector('input[aria-label="Alex Demo"]')`, 'named follower choice');
  assert(!(await evaluate(dummy, `document.querySelector('fieldset').innerText`)).includes(originalAlex.userId));
  await evaluate(dummy, `document.querySelector('input[aria-label="Alex Demo"]').click()`);
  await until(dummy, `document.querySelector('[aria-label="Audience"]')?.innerText.includes('Alex Demo')`, 'the preview names the follower the post is going to');
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
  const postsRequestsBefore = requestsTo(alex, '/posts?liked=');
  await button(alex, 'Unfollow');
  await until(alex, stats(beforeFollow.followers.length - 1), 'viewed profile updates follower count');
  assert.equal(requestsTo(alex, '/posts?liked='), postsRequestsBefore, `unfollowing must not refetch the profile post list: ${requestsMatching(alex, '/posts?liked=')}`);
  await until(dummy, stats(beforeFollow.followers.length - 1), 'owner sees live follower count');
  await button(alex, 'Follow');
  await until(alex, stats(beforeFollow.followers.length), 'follow restores follower count');
  assert.equal(requestsTo(alex, '/posts?liked='), postsRequestsBefore, `following must not refetch the profile post list either: ${requestsMatching(alex, '/posts?liked=')}`);
  await until(dummy, stats(beforeFollow.followers.length), 'owner sees restored count');
  console.log('PASS: profile follow/unfollow and live database counts');

  await api(dummy, `/posts/${postId}`, 'PUT', { ...restricted, privacy: 'followers', selectedFollowerIds: [] });
  await api(alex, `/users/${originalDummy.userId}/follow`, 'DELETE');
  const privateOwner = await api(dummy, '/users/me');
  await api(dummy, '/users/me', 'PUT', { ...privateOwner, isPublic: false });
  await navigate(dummy, '/create-post');
  await until(dummy, `!!document.querySelector('main select')`, 'the composer for a private profile');
  await fill(dummy, 'main select', 'public');
  await until(dummy, `document.querySelector('[aria-label="Audience"]')?.innerText.includes('Your profile is private')`, 'a private profile narrows even a public post');
  await navigate(dummy, '/notifications');
  await navigate(alex, `/profile/${originalDummy.userId}`);
  await button(alex, 'Follow');
  await until(alex, `!!document.querySelector('button[title="Cancel follow request"]')`, 'private profile shows Requested');
  assert(await evaluate(alex, `!document.querySelector('a[href="/messages/${originalDummy.userId}"]') && [...document.querySelectorAll('[title]')].some(node => node.getAttribute('title').includes('one of you follows the other'))`), 'a private profile replaces the message link with an explanation');
  assert.equal((await api(dummy, '/users/me')).followers.includes(originalAlex.userId), false);
  assert.equal(await evaluate(alex, `(async () => (await fetch('/api/v1/media/${mediaURL.split('/').pop()}', { cache: 'no-store' })).status)()`), 403);
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
  await until(alex, `document.body.innerText.includes('Unfollow') && document.body.innerText.includes(${JSON.stringify(`Updated browser post content ${stamp}`)})`, 'accept unlocks private profile live');
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
  await evaluate(dummy, `document.querySelector('button[aria-label="Group details"]').click()`);
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
  await checkMessageMenus(dummy, 'Message actions');
  await button(dummy, 'Events');
  await button(dummy, 'New event');
  await fill(dummy, 'input[name="title"]', `Meetup ${stamp}`);
  await fill(dummy, 'input[name="startsAt"]', '2030-12-01T18:00');
  await fill(dummy, 'textarea[name="content"]', 'Meet at the park');
  await button(dummy, 'Create event');
  await until(alex, `document.body.innerText.includes(${JSON.stringify(`Meetup ${stamp}`)})`, 'event appears in chat');
  await button(alex, 'Events');
  await button(alex, 'Going');
  await until(dummy, `document.body.innerText.includes('1 going')`, 'live RSVP');
  await button(dummy, 'Posts');
  await button(dummy, 'New post');
  await fill(dummy, 'textarea[name="content"]', `Group post ${stamp}`);
  await button(dummy, 'Publish');
  await until(dummy, `document.body.innerText.includes(${JSON.stringify(`Group post ${stamp}`)})`, 'group post lands in the Posts folder');
  assert(await evaluate(dummy, `!!document.querySelector('.grp-comments .grp-comment-field input')`), 'a group post offers its comment input');
  await evaluate(dummy, `document.querySelector('button[aria-label="Group details"]').click()`);
  await button(dummy, 'Edit');
  await fill(dummy, 'textarea[name="description"]', 'Updated group description');
  await button(dummy, 'Save group');
  await until(dummy, `!document.querySelector('textarea[name="description"]') && document.body.innerText.includes('Updated group description')`, 'group edit');
  const groupShot = await command('Page.captureScreenshot', { format: 'png' }, dummy);
  await writeFile(path.join(taskDir, 'group-info.png'), Buffer.from(groupShot.data, 'base64'));
  await evaluate(dummy, `document.querySelector('button[aria-label="Close details"]').click()`);
  await button(dummy, 'Chat');
  await until(dummy, `document.querySelector('section[aria-label^="Group conversation"]').innerText.includes(${JSON.stringify(`Group hello ${stamp}`)})`, 'chat is loaded for screenshot');
  const chatShot = await command('Page.captureScreenshot', { format: 'png' }, dummy);
  await writeFile(path.join(taskDir, 'group-chat.png'), Buffer.from(chatShot.data, 'base64'));
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, dummy);
  await pause(500);
  assert(await evaluate(dummy, 'document.documentElement.scrollWidth <= window.innerWidth'), 'Mobile chat has no horizontal overflow');
  await until(dummy, `(() => { const bar = document.querySelector('nav[aria-label="Primary"]'); if (!bar) return false; const r = bar.getBoundingClientRect(); return r.height > 0 && r.bottom <= window.innerHeight + 1; })()`, 'mobile bottom tab bar is on screen');
  assert(await evaluate(dummy, `getComputedStyle(document.querySelector('aside[aria-label="Main navigation"]')).display === 'none'`), 'the sidebar is not shown on a phone');
  const mobileShot = await command('Page.captureScreenshot', { format: 'png' }, dummy);
  await writeFile(path.join(taskDir, 'mobile-chat.png'), Buffer.from(mobileShot.data, 'base64'));
  await clickAt(dummy, 'nav[aria-label="Primary"] a[href="/search"]');
  await until(dummy, `location.pathname === '/search'`, 'the Search tab opens search');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, dummy);
  console.log('PASS: groups inside conversations, join approval, group chat, events, RSVP, posts, editing and mobile layout');

  await navigate(dummy, '/notifications');
  await until(dummy, `!!document.querySelector('a[href="/messages/groups/${group.groupId}?tab=info"]')`, 'join request notification target');
  await evaluate(dummy, `document.querySelector('a[href="/messages/groups/${group.groupId}?tab=info"]').click()`);
  await until(dummy, `!!document.querySelector('aside[aria-label="Group details"]') && !!document.querySelector('a[href="/profile/${originalAlex.userId}"]')`, 'request notification opens the group details panel');
  await until(dummy, `!!document.querySelector('a[href="/profile/${originalAlex.userId}"]')`, 'member list in the details panel');
  assert(await evaluate(dummy, `[...document.querySelectorAll('button')].every(button => button.textContent.trim() !== 'Load more members')`), 'a short member list must not offer a second page');
  assert(await evaluate(dummy, `document.body.innerText.includes("You're all caught up")`), 'the member list has to report that it ended');
  await navigate(alex, '/notifications');
  await until(alex, `!!document.querySelector('a[href="/messages/groups/${group.groupId}?tab=events"]')`, 'event notification target');
  await evaluate(alex, `document.querySelector('a[href="/messages/groups/${group.groupId}?tab=events"]').click()`);
  await until(alex, `document.querySelector('[aria-label="Group conversation tabs"] button[aria-selected="true"]')?.textContent === 'Events' && document.body.innerText.includes(${JSON.stringify(`Meetup ${stamp}`)})`, 'event notification opens the events tab');
  assert(await evaluate(alex, `(() => { const heading = [...document.querySelectorAll('h4')].find(node => node.textContent.trim().toLowerCase() === 'upcoming'); const event = [...document.querySelectorAll('article')].find(node => node.innerText.includes(${JSON.stringify(`Meetup ${stamp}`)})); return !!heading && !!event && (heading.compareDocumentPosition(event) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0; })()`), 'the upcoming event belongs under the Upcoming heading');
  console.log('PASS: group notifications deep-link to the tab that needs attention');

  await navigate(dummy, '/search');
  await until(dummy, `!!document.querySelector('input[aria-label="Search posts, people and groups"]')`, 'search page');
  await fill(dummy, 'input[aria-label="Search posts, people and groups"]', `browser post content ${stamp}`);
  await button(dummy, 'Search');
  await until(dummy, `location.search.includes('q=') && document.body.innerText.includes(${JSON.stringify(`browser post content ${stamp}`)})`, 'the post search finds the post');
  await fill(dummy, 'input[aria-label="Search posts, people and groups"]', 'alexdemo');
  await button(dummy, 'Search');
  await until(dummy, `document.body.innerText.includes('@alexdemo')`, 'the people half finds Alex');
  await fill(dummy, 'input[aria-label="Search posts, people and groups"]', `Browser group ${stamp}`);
  await button(dummy, 'Search');
  await until(dummy, `document.body.innerText.includes(${JSON.stringify(`Browser group ${stamp}`)})`, 'the group half finds the group');
  await navigate(dummy, '/search');
  await until(dummy, `[...document.querySelectorAll('button')].some(candidate => candidate.textContent.trim() === ${JSON.stringify(`Browser group ${stamp}`)})`, 'the last term is offered back');
  await command('Page.navigate', { url: base + '/search' }, dummy);
  await until(dummy, `[...document.querySelectorAll('button')].some(candidate => candidate.textContent.trim() === ${JSON.stringify(`Browser group ${stamp}`)})`, 'the recent term survives a reload');
  console.log('PASS: one search page looks through posts, people and groups and remembers the terms');

  await navigate(dummy, '/');
  await evaluate(dummy, `[...document.querySelectorAll('button')].find(button => button.textContent.includes('Your story')).click()`);
  await fill(dummy, '[role="dialog"] textarea', `Browser story ${stamp}`);
  await button(dummy, 'Share story');
  await until(dummy, `!document.querySelector('[role="dialog"]')`, 'the story composer closes');
  storyId = (await api(dummy, '/stories')).find(story => story.content === `Browser story ${stamp}`).storyId;
  await until(dummy, `!!document.querySelector('[data-story-id="${storyId}"]')`, 'the story joins the tray');
  await navigate(alex, '/');
  await until(alex, `document.querySelector('[data-story-id="${storyId}"] [data-story-ring]')?.dataset.storyRing === 'unseen'`, 'a fresh story wears the unseen ring for a reader');
  await evaluate(alex, `document.querySelector('[data-story-id="${storyId}"]').click()`);
  await until(alex, `document.querySelector('[role="dialog"][aria-label="Story"]') !== null`, 'the story opens');
  await until(alex, `!!document.querySelector('input[aria-label="Reply to story"]')`, 'a reader is offered the reply box');
  await fill(alex, 'input[aria-label="Reply to story"]', `Browser reply ${stamp}`);
  await evaluate(alex, `document.querySelector('button[aria-label="Send reply"]').click()`);
  await until(alex, `document.querySelector('input[aria-label="Reply to story"]').value === ''`, 'the reply is sent');
  await evaluate(alex, `document.querySelector('button[aria-label="Close story"]').click()`);
  await until(alex, `document.querySelector('[role="dialog"]') === null`, 'the reader closes the story');
  assert.equal((await api(alex, '/stories')).find(story => story.storyId === storyId).viewed, true, 'the view is recorded for this reader');
  await until(alex, `document.querySelector('[data-story-id="${storyId}"] [data-story-ring]')?.dataset.storyRing === 'seen'`, 'viewing the story turns its ring');

  await navigate(dummy, '/');
  await until(dummy, `!!document.querySelector('[data-story-id="${storyId}"]')`, 'the author is back at the tray');
  await evaluate(dummy, `document.querySelector('[data-story-id="${storyId}"]').click()`);
  await until(dummy, `document.querySelector('[role="dialog"][aria-label="Story"]') !== null`, 'the author opens their story');
  await until(dummy, `[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Seen by 1')`, 'the author is offered the viewer count');
  await button(dummy, 'Seen by 1');
  await until(dummy, `document.querySelector('[role="dialog"][aria-label="Story"]').innerText.includes('alexdemo')`, 'the seen-by list names the viewer');
  console.log('PASS: a story shows its author who has seen it');
  await evaluate(dummy, `document.querySelector('button[aria-label="Close viewers"]').click()`);
  await until(dummy, `[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Replies 1')`, 'the author is offered the reply count');
  await button(dummy, 'Replies 1');
  await until(dummy, `document.querySelector('[role="dialog"][aria-label="Story"]').innerText.includes(${JSON.stringify(`Browser reply ${stamp}`)})`, 'the author reads the reply');
  console.log('PASS: a story reply reaches its author alone');
  await evaluate(dummy, `document.querySelector('button[aria-label="Close story"]').click()`);
  await until(dummy, `document.querySelector('[role="dialog"]') === null`, 'the author closes the story');

  await navigate(dummy, '/profile');
  await button(dummy, 'View archive');
  await until(dummy, `document.querySelector('[role="dialog"][aria-label="Story archive"]')?.innerText.includes('From yesterday, kept in the archive')`, 'the author reads an archived story');
  console.log("PASS: an expired story stays in its author's archive");
  await evaluate(dummy, `[...document.querySelectorAll('[role="dialog"][aria-label="Story archive"] button')].find(candidate => candidate.textContent.trim() === 'Close')?.click()`);
  await until(dummy, `document.querySelector('[role="dialog"][aria-label="Story archive"]') === null`, 'the archive closes');
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
  await until(dummy, `!!document.querySelector('[data-connected="true"]')`, 'dummy WebSocket');
  await until(alex, `!!document.querySelector('[data-connected="true"]')`, 'Alex WebSocket');
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

  const bubble = `[...document.querySelectorAll('article')].find(item => item.innerText.includes(${JSON.stringify(`Browser message ${stamp}`)}))`;
  await until(dummy, `!!(${bubble})?.querySelector('button[aria-label="React to this message"]')`, 'the message offers a reaction');
  await evaluate(dummy, `(${bubble})?.querySelector('button[aria-label="React to this message"]').click()`);
  await until(dummy, `!!(${bubble})?.querySelector('button[aria-label="Remove your reaction to this message"]')`, 'the reaction registers on the message');
  assert.equal(await evaluate(dummy, `(async () => { const page = await (await fetch('/api/v1/messages?partnerId=${originalAlex.userId}')).json(); return page.data.messages.find(item => item.messageId === ${sentMessages[0].messageId})?.score; })()`), 1, 'the reaction total reaches the message');
  await evaluate(dummy, `(${bubble})?.querySelector('button[aria-label="Remove your reaction to this message"]').click()`);
  await until(dummy, `!!(${bubble})?.querySelector('button[aria-label="React to this message"]')`, 'the reaction is taken back');
  console.log('PASS: a chat message can be reacted to and un-reacted, and the total belongs to the message');
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

  const mediaMessage = await evaluate(dummy, `(async () => {
    const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=');
    const bytes = new Uint8Array([...binary].map(character => character.charCodeAt(0)));
    const form = new FormData();
    form.append('file', new Blob([bytes], { type: 'image/png' }), 'chat-photo.png');
    const uploaded = await (await fetch('/api/v1/media', { method: 'POST', body: form })).json();
    const sent = await (await fetch('/api/v1/messages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ recipientId: ${JSON.stringify(originalAlex.userId)}, text: 'A photo in the chat', mediaUrl: uploaded.data.url, mediaType: uploaded.data.mediaType }) })).json();
    return sent.data;
  })()`);
  assert(mediaMessage?.mediaUrl, `the media message must be sent: ${JSON.stringify(mediaMessage)}`);
  await navigate(dummy, `/messages/${originalAlex.userId}`);
  await evaluate(dummy, `document.querySelector('button[aria-label="Conversation details"]').click()`);
  await until(dummy, `!!document.querySelector('button[aria-label="Open attachment 1"]')`, 'the details panel lists the attachment');
  await evaluate(dummy, `document.querySelector('button[aria-label="Open attachment 1"]').click()`);
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Conversation media viewer"]')`, 'the attachment opens in the lightbox');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, dummy);
  await until(dummy, `!document.querySelector('[role="dialog"][aria-label="Conversation media viewer"]')`, 'the lightbox closes again');
  await evaluate(dummy, `document.querySelector('button[aria-label="Close details"]').click()`);
  await until(dummy, `!!document.querySelector('textarea[aria-label="Message"]')`, 'the thread keeps its composer');
  console.log('PASS: a conversation lists its attachments, and one opens in the app rather than a new tab');

  const opened = await evaluate(alex, `(async () => {
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
    window.__loadFrames = 0;
    window.__loadSockets = Array.from({ length: 50 }, () => {
      const socket = new WebSocket(url);
      socket.onmessage = event => { if (String(event.data).includes('incoming_msg')) window.__loadFrames++; };
      return socket;
    });
    const results = await Promise.all(window.__loadSockets.map(socket => new Promise(resolve => {
      socket.onopen = () => resolve(true);
      socket.onerror = () => resolve(false);
    })));
    return results.filter(Boolean).length;
  })()`);
  assert.equal(opened, 50, `fifty sockets have to open through the proxy, got ${opened}`);
  await pause(300);
  await evaluate(dummy, `(async () => {
    const socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
    await new Promise((resolve, reject) => { socket.onopen = () => resolve(true); socket.onerror = () => reject(new Error('sender socket failed')); });
    socket.send(JSON.stringify({ type: 'private_msg', payload: { recipientId: ${JSON.stringify(originalAlex.userId)}, text: ${JSON.stringify(`Load fan-out ${stamp}`)} } }));
    await new Promise(resolve => setTimeout(resolve, 500));
    socket.close();
    return true;
  })()`);
  await until(alex, `window.__loadFrames === 50`, 'every socket receives the fan-out', 15000);
  await evaluate(alex, `window.__loadSockets.forEach(socket => socket.close()); delete window.__loadSockets; true`);
  console.log('PASS: 50 sockets through the frontend proxy, all receiving one fan-out');

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

  await fill(dummy, 'textarea[aria-label="Message"]', 'This unauthorized message must not be sent');
  await api(dummy, '/auth/logout', 'POST');
  const endedBy = await evaluate(dummy, `(() => {
    const send = document.querySelector('[aria-label="Send message"]');
    if (!send) return 'a poll that was already in flight';
    send.click();
    return 'the send button';
  })()`);
  if (endedBy !== 'the send button') console.log(`NOTE: the session ended via ${endedBy}, so the 401 reached the login form before this step could send`);
  await until(dummy, `location.pathname === '/login' && !!document.querySelector('input[name="identifier"]')`, 'expired session redirects to login');
  await fill(dummy, 'input[name="identifier"]', 'dummy@example.com');
  await fill(dummy, 'input[name="password"]', 'DummyUser123!');
  await evaluate(dummy, `document.querySelector('form').requestSubmit()`);
  await until(dummy, `location.pathname === '/' && !!document.querySelector('aside[aria-label="Main navigation"]')`, 'sign back in after expiry');
  console.log('PASS: API 401 redirects to login and the normal login form restores access');

  await command('Page.navigate', { url: base + '/connections' }, dummy);
  await until(dummy, `location.pathname === '/profile'`, 'the legacy connections URL redirects to the profile');
  console.log('PASS: the legacy connections URL still redirects to the profile');

  await navigate(dummy, '/profile');
  await settingsItem(dummy, 'Change password');
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

  await settingsItem(dummy, 'Change password');
  await until(dummy, `!!document.querySelector('[aria-label="Change password"]')`, 'password dialog for the restore');
  await fill(dummy, 'input[name="currentPassword"]', 'BrowserRotate123!');
  await fill(dummy, 'input[name="newPassword"]', 'DummyUser123!');
  await fill(dummy, 'input[name="confirmPassword"]', 'DummyUser123!');
  await evaluate(dummy, `document.querySelector('[aria-label="Change password"] form').requestSubmit()`);
  await until(dummy, `!document.querySelector('[aria-label="Change password"]')`, 'the seeded password is restored', 15000);
  console.log('PASS: the replacement password works as the current one and the seed is restored');

  const newcomer = await createPage(null);
  const registerClicks = await buttonThen(newcomer, 'Need an account? Register', `!!document.querySelector('input[name="firstName"]')`, 'register form');
  if (registerClicks > 1) console.log(`NOTE: the register link took ${registerClicks} clicks; the first landed before hydration`);
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

  const optional = await createPage(null);
  await buttonThen(optional, 'Need an account? Register', `!!document.querySelector('input[name="firstName"]')`, 'second register form');
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
  const tooSmall = path.join(taskDir, 'too-small-avatar.png');
  await writeFile(tooSmall, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=', 'base64'));
  const registerDocument = await command('DOM.getDocument', {}, optional);
  const avatarInput = await command('DOM.querySelector', { nodeId: registerDocument.root.nodeId, selector: 'input[aria-label="Add photos"]' }, optional);
  await command('DOM.setFileInputFiles', { nodeId: avatarInput.nodeId, files: [tooSmall] }, optional);
  await until(optional, `document.body.innerText.includes('at least 200×200')`, 'the small avatar is refused with the floor named');
  assert(await evaluate(optional, `!document.querySelector('img[alt="Preview of too-small-avatar.png"]')`), 'the refused avatar must not be added');
  const avatarFixture = path.join(taskDir, 'avatar.png');
  await writeFile(avatarFixture, largePng(256, 256));
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
  const resetEmail = `browser-optional-${stamp}@example.com`;
  const forgot = await createPage(null);
  await command('Page.navigate', { url: base + '/forgot' }, forgot);
  await until(forgot, `location.pathname === '/forgot' && !!document.querySelector('input[name="email"]')`, 'the forgot form');
  await fill(forgot, 'input[name="email"]', resetEmail);
  await button(forgot, 'Send reset link');
  await until(forgot, `!!document.querySelector('[role="status"]')`, 'the neutral reset answer');
  const neutral = await evaluate(forgot, `document.querySelector('[role="status"]').innerText`);
  assert(/If that address has an account/.test(neutral), `the page rewrote the answer: ${neutral}`);

  const resetToken = await resetTokenFromLog(path.join(taskDir, 'backend.log'));
  const resetPage = await createPage(null);
  await command('Page.navigate', { url: `${base}/reset?token=${encodeURIComponent(resetToken)}` }, resetPage);
  await until(resetPage, `location.pathname === '/reset' && !!document.querySelector('input[name="password"]')`, 'the reset form');
  await fill(resetPage, 'input[name="password"]', 'ResetByLink123!');
  await fill(resetPage, 'input[name="confirmPassword"]', 'ResetByLink123!');
  await button(resetPage, 'Set new password');
  await until(resetPage, `location.pathname === '/login'`, 'the reset sends the visitor to sign in', 15000);

  const revoked = await evaluate(optional, `(async () => (await fetch('/api/v1/users/me')).status)()`);
  assert.equal(revoked, 401, 'a reset must end the sessions the account had');

  const afterReset = await createPage(null);
  await command('Page.navigate', { url: base + '/login' }, afterReset);
  await until(afterReset, `!!document.querySelector('input[name="identifier"]')`, 'the sign-in form after a reset');
  await fill(afterReset, 'input[name="identifier"]', resetEmail);
  await fill(afterReset, 'input[name="password"]', 'ResetByLink123!');
  await button(afterReset, 'Sign in');
  await until(afterReset, `location.pathname === '/'`, 'signing in with the password the link set', 15000);
  console.log('PASS: the reset link from the mail log sets a new password and signs in');

  await navigate(dummy, '/dev/components');
  await until(dummy, `document.body.innerText.includes('Component gallery') && !!document.querySelector('[aria-label="Audience"]')`, 'the component gallery renders the redesigned pieces');
  console.log('PASS: the dev-only component gallery renders the redesigned pieces in isolation');



  await navigate(dummy, '/');
  await until(dummy, `!!document.querySelector('article')`, 'feed ready for scroll');
  await evaluate(dummy, `window.scrollTo(0, document.body.scrollHeight)`);
  const sidebarPosition = await evaluate(dummy, `({ scrollY: window.scrollY, top: document.querySelector('aside[aria-label="Main navigation"]').getBoundingClientRect().top, bodyHeight: document.body.offsetHeight, viewport: window.innerHeight })`);
  assert(sidebarPosition.scrollY > 0 && Math.abs(sidebarPosition.top) < 1, `Sidebar stays at top while the feed scrolls: ${JSON.stringify(sidebarPosition)}`);
  assert(await evaluate(dummy, `document.querySelector('aside img[alt="Social Network"]').naturalWidth > 0`), 'Sidebar logo loads');
  await evaluate(dummy, `window.scrollTo(0, 0)`);
  const screenshot = await command('Page.captureScreenshot', { format: 'png' }, dummy);
  await writeFile(path.join(taskDir, 'frontend.png'), Buffer.from(screenshot.data, 'base64'));
  for (const route of ['/create-post', '/messages', `/messages/groups/${group.groupId}`, '/profile', '/notifications', '/discover']) {
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
  console.log('PASS: the composer, messages, group chat, profile, notifications and discover fit 320, 375, 768 and 1440 px');
  assert.deepEqual(exceptions, [], 'Browser runtime exceptions');
  console.log('PASS: no browser runtime exceptions');
  assert.deepEqual(consoleErrors, [], `Browser console errors: ${JSON.stringify(consoleErrors.slice(0, 5))}`);
  console.log('PASS: no browser console errors');
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
