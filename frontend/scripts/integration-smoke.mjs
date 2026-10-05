import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

// A PNG written by hand. The downscale check below needs a photo wider than the cap,
// and nothing in these dependencies encodes one: the fixtures here are all 1x1, and a
// canvas only exists inside the browser. The format is a signature, an IHDR, a zlib
// stream of raw scanlines and an IEND, each chunk carrying its own CRC.
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
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour RGB
  const raw = Buffer.alloc(height * (1 + width * 3));
  let at = 0;
  for (let y = 0; y < height; y++) {
    raw[at++] = 0; // filter: none
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
// Chrome is not bundled and its executable lives in a different place on each
// platform, so CHROME_PATH wins wherever it is set — a Linux runner has to set it
// — and the rest are the usual install locations. Failing here, by name, beats
// letting a nonexistent binary come back as a spawn error that reads like a
// broken suite.
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
// Every same-origin response the browser saw, grouped by page. It exists so a test
// can assert that an action did *not* refetch a list, which nothing else can check
// — and it is per page because the suite keeps several tabs open at once, where
// another tab's legitimate refetch must not read as this one's.
const responsesByPage = new Map();
const requestsMatching = (page, fragment) => (responsesByPage.get(page) || []).filter(url => url.includes(fragment));
const requestsTo = (page, fragment) => requestsMatching(page, fragment).length;
// Console errors, so a regression that only shows up as a warning or a React
// hydration complaint cannot pass unnoticed: the suite watches exceptions, which
// those are not.
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
      } catch { /* Navigation can discard the exception object. */ }
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
// A click on a page that was just created can land before React has attached its
// handler. The button is in the server-rendered HTML, so the click is accepted and
// nothing happens — a 60-second stall rather than a failure with a cause. That was
// measured, not assumed: in the run that failed here the frontend log contained no
// request for the page the click was meant to open, so the navigation never started.
// Clicking again while waiting for what the click should cause closes the race
// without weakening the check, since repeating a navigation click is harmless and
// the assertion still has to hold. Returns how many clicks it took, so a hiccup is
// reported instead of hidden.
async function buttonThen(page, text, expression, label, timeout = 60000) {
  const end = Date.now() + timeout;
  let clicks = 0;
  while (Date.now() < end) {
    if (await evaluate(page, expression)) return clicks;
    try {
      await button(page, text);
      clicks += 1;
    } catch {
      break; // The button left the page, so an earlier click did land.
    }
    await pause(500);
  }
  await until(page, expression, label, Math.max(1000, end - Date.now()));
  return clicks;
}
// The development mailer writes reset links into the backend's log, which is the
// only place a browser test can read one: the API never returns the token. The line
// can trail the HTTP response by a moment because the harness pipes the backend's
// stdout into that file, hence the polling rather than a single read.
async function resetTokenFromLog(logPath, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const text = await readFile(logPath, 'utf8');
      const matches = [...text.matchAll(/\/reset\?token=([A-Za-z0-9_-]{20,})/g)];
      if (matches.length) return matches[matches.length - 1][1];
    } catch { /* The log may not exist yet. */ }
    await pause(200);
  }
  throw new Error(`No reset link reached ${logPath}`);
}
async function enter(page, shift = false) {
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, text: '\r', modifiers: shift ? 8 : 0 }, page);
  await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: shift ? 8 : 0 }, page);
}
// Ctrl + Enter, through the browser's own key pipeline rather than by calling the
// handler. Ctrl rather than Meta because the suite runs on every platform and the
// composer accepts either; the key is delivered to whatever has focus, which is why
// the step that uses this focuses the textarea first — the same place a reader's
// caret is when they reach for the shortcut.
async function enterWithControl(page) {
  const modifiers = 2; // 1 = Alt, 2 = Ctrl, 4 = Meta, 8 = Shift
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

  // The feed's "People you may know" rail: it offers members the viewer does not follow,
  // and following one from it takes them out of the rail. The follow is undone at the end,
  // because the request flows later in this suite start from nobody following anybody.
  await until(dummy, `!!document.querySelector('section[aria-label="Suggested for you"]')`, 'the feed offers people to follow', 15000);
  const suggestion = (await api(dummy, '/users?q=alexdemo')).find(person => person.nickname === 'alexdemo');
  assert(suggestion, 'Alex must be someone the rail can offer');
  await until(dummy, `document.querySelector('section[aria-label="Suggested for you"]').innerText.includes('@alexdemo')`, 'the rail offers Alex');
  await evaluate(dummy, `[...document.querySelectorAll('section[aria-label="Suggested for you"] button')].find(candidate => candidate.textContent === 'Follow').click()`);
  await until(dummy, `!(document.querySelector('section[aria-label="Suggested for you"]')?.innerText || '').includes('@alexdemo')`, 'the followed member leaves the rail');
  assert(await evaluate(dummy, `(async () => (await (await fetch('/api/v1/users/me')).json()).data.following.includes(${JSON.stringify(suggestion.userId)}))()`), 'following from the rail must reach the account');
  await api(dummy, `/users/${suggestion.userId}/follow`, 'DELETE');
  await navigate(dummy, '/');
  await until(dummy, `(document.querySelector('section[aria-label="Suggested for you"]')?.innerText || '').includes('@alexdemo')`, 'unfollowing offers the member again');
  console.log('PASS: the feed offers people you may know, and following one takes them out of it');

  await navigate(dummy, '/create-post');
  await fill(dummy, 'input[placeholder="Give your post a title"]', `Browser ${stamp}`);
  await fill(dummy, 'textarea', `Persisted browser integration test ${stamp}`);
  // Two photos rather than one, so the lightbox below has a set to move through.
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
  // The tile reports what was chosen before the upload is spent — the measured
  // canvas and the file's own size — so a rejection is never the first mention of
  // either. The fixture is a 1x1 PNG, hence the shape of the expected caption.
  const tileDetails = await evaluate(dummy, `(() => { const tile = document.querySelector('img[alt="Preview of pixel.png"]').closest('div'); const caption = tile && tile.querySelector('span'); return caption && caption.textContent.trim(); })()`);
  assert(/^\d+ × \d+ · \d+ B$/.test(String(tileDetails)), `the picker must show the file's dimensions and size, got ${JSON.stringify(tileDetails)}`);
  await button(dummy, 'Publish Post');
  await until(dummy, `location.pathname === '/' && document.body.innerText.includes(${JSON.stringify(`Browser ${stamp}`)})`, 'publish post');
  const created = (await api(dummy, '/posts')).posts.find(post => post.title === `Browser ${stamp}`);
  assert(created); postId = created.postId; mediaURL = created.imageUrls[0]; assert(mediaURL);
  await navigate(dummy, `/post/${postId}`);
  await until(dummy, `!!document.querySelector('button[aria-label="Like post"]')`, 'post details');
  await evaluate(dummy, `document.querySelector('button[aria-label="Like post"]').click()`);
  await until(dummy, `(async () => (await (await fetch('/api/v1/post?id=${postId}')).json()).data.score === 1)()`, 'post reaction');
  console.log('PASS: post creation, image upload, detail page and reaction persist');

  // The Instagram composer is a dialog and not only a route. It is opened from the sidebar's
  // "Create Post" — the single place a desktop starts a post, the way Instagram's left rail carries
  // it, after the feed's own duplicate button was removed — and Escape closes it without leaving.
  // `/create-post`, the step above, stays the deep link, so both entries are still covered.
  await navigate(dummy, '/');
  await button(dummy, 'Create Post');
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Create a post"] textarea')`, 'the sidebar opens the composer dialog');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, dummy);
  await until(dummy, `!document.querySelector('[role="dialog"][aria-label="Create a post"]')`, 'Escape closes the composer');
  console.log('PASS: the sidebar opens the composer as a dialog and Escape closes it');

  // Client-side cropping: a portrait photo cropped to a square must travel as a square. The
  // picker's tile caption is driven by the file it now holds, so it is the proof the crop
  // really happened rather than a CSS frame — the fixture starts 600×900 and ends 600×600.
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

  // This step and the composer-dialog one above navigated away from the post the next steps
  // assume they are looking at (they read it off the detail page), so come back to it — and
  // wait for the card, which is fetched after the route change and is what the next steps read
  // the edit link and the like button off, so a fast hand-off cannot outrun it.
  await navigate(dummy, `/post/${postId}`);
  await until(dummy, `!!document.querySelector('a[aria-label="Edit post"]')`, 'the post page is loaded again');

  // The item's own claim, measured in the browser: the feed must stop downloading
  // full-resolution originals, so every request for this post's picture carries a `?size=`.
  // The upload here is a 1x1 PNG, which is narrower than both caps and therefore has no
  // derivatives at all — so what the server answers is the original, and the point is which
  // URL the browser asked for rather than what came back. That combination is the useful one:
  // it proves the srcset is used for an upload that has nothing to choose between.
  // The browser fetches the picture after the document, so wait for that request rather than
  // racing it: the assertion below is about which URL arrives, not about it arriving.
  for (let attempt = 0; attempt < 40 && requestsMatching(dummy, mediaURL).length === 0; attempt++) await pause(250);
  const mediaRequests = requestsMatching(dummy, mediaURL);
  assert(mediaRequests.length > 0, 'the post picture should have been requested');
  assert(mediaRequests.every(url => url.includes('?size=')), `every request for the picture must name a size, got ${JSON.stringify(mediaRequests)}`);
  console.log('PASS: the picture is fetched through a sized variant, never as the bare original');

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

  // The lightbox replaces opening the raw file in a new tab: the photo opens in a
  // dialog, the arrow keys move through the set, Escape closes it, and the focus
  // goes back to the picture it was opened from. The click is a real mouse event so
  // the button can hold focus at all — a scripted `.click()` would not.
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

  // Bookmarks: the control lives on the card, the list has a page of its own, and
  // un-saving from that page drops the row rather than leaving a stale card. Both
  // writes are idempotent on the server, so the waits are on the resulting state.
  await until(dummy, `!!document.querySelector('button[aria-label="Save post"]')`, 'the save control is on the post');
  await evaluate(dummy, `document.querySelector('button[aria-label="Save post"]').click()`);
  await until(dummy, `(async () => (await (await fetch('/api/v1/saved-posts?page=1&size=10')).json()).data.posts.some(post => post.postId === ${postId}))()`, 'the post reaches the saved list');
  await until(dummy, `!!document.querySelector('button[aria-label="Remove from saved"]')`, 'the control reflects the saved state');
  await navigate(dummy, '/saved');
  await until(dummy, `document.body.innerText.includes(${JSON.stringify(`Updated ${stamp}`)})`, 'the saved page lists the bookmarked post');
  await evaluate(dummy, `document.querySelector('button[aria-label="Remove from saved"]').click()`);
  await until(dummy, `!document.body.innerText.includes(${JSON.stringify(`Updated ${stamp}`)})`, 'un-saving drops the row');
  assert.equal(await evaluate(dummy, `(async () => (await (await fetch('/api/v1/saved-posts?page=1&size=10')).json()).data.totalElements)()`), 0, 'the saved list is empty after un-saving');
  console.log('PASS: a post is saved from its card, listed on the private Saved page, and dropped when un-saved');

  // The composer's own contract, measured rather than assumed: the reason a publish
  // is blocked is on the page and attached to the field it is about, a draft survives
  // a reload while saying what did not come back, and Ctrl/Cmd + Enter publishes from
  // the textarea where the text was typed. The storage key here is the one
  // `lib/postDraft.ts` owns, which is the part of that module a browser can check.
  const draftKey = 'social:post-draft';
  await navigate(dummy, '/create-post');
  // The audience banner is the part of the preview that is about the reader rather than
  // the look: it must say who can read the draft, not merely repeat the privacy label.
  // This account is public, so `public` reaches everyone and `followers` does not; the
  // `selected` wording is asserted later, where a follower exists to name.
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
  await fill(dummy, 'input[placeholder="Give your post a title"]', `Draft ${stamp}`);
  await until(dummy, `(localStorage.getItem(${JSON.stringify(draftKey)}) || '').includes(${JSON.stringify(`Draft ${stamp}`)})`, 'the draft reaches storage');
  await command('Page.navigate', { url: base + '/create-post' }, dummy);
  await until(dummy, `!!document.getElementById('draft-restored')`, 'the draft is offered back after a reload');
  assert.equal(await evaluate(dummy, `document.querySelector('textarea').value`), 'Too short', 'the restored draft is the text that was typed');
  assert.equal(await evaluate(dummy, `document.querySelector('input[placeholder="Give your post a title"]').value`), `Draft ${stamp}`);
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

  // A photo larger than the cap is shrunk in the browser before it is sent, so the bytes
  // that travel and the bytes kept are the capped ones. The fixture is 2000 px wide — a
  // phone photo's shape — and the assertion is on what the *server* serves back, since
  // that is the file the upload actually produced.
  const largeFixture = path.join(taskDir, 'large.png');
  await writeFile(largeFixture, largePng(2000, 1500));
  await navigate(dummy, '/create-post');
  await fill(dummy, 'textarea', `Downscaled upload ${stamp}`);
  const largeDocument = await command('DOM.getDocument', {}, dummy);
  const largeNode = await command('DOM.querySelector', { nodeId: largeDocument.root.nodeId, selector: 'input[type="file"]' }, dummy);
  await command('DOM.setFileInputFiles', { nodeId: largeNode.nodeId, files: [largeFixture] }, dummy);
  // The picker decodes the file before it accepts it — that is where the caption's
  // dimensions come from — so publishing before the preview exists would send a post
  // with no photo at all. The wait is the same one the smaller fixture above uses.
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

  // A hashtag and a mention are links, and each goes somewhere real: the tag to its
  // results page, the mention to the member it names through the handle lookup. The tag
  // is compared whole by the endpoint, so the fixture uses one only this post carries.
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
  assert(await evaluate(alex, `!!document.querySelector('a[aria-label="New message"]')`));
  await navigate(alex, `/post/${postId}`);
  await until(alex, `!!document.querySelector('button[aria-label="Like post"]')`, 'other author post');
  assert(!(await evaluate(alex, `!!document.querySelector('a[aria-label="Edit post"]')`)));
  await navigate(alex, `/post/${postId}/edit`);
  await until(alex, `document.body.innerText.includes('You can only edit your own posts.')`, 'non-owner editor denied');
  assert(!(await evaluate(alex, `!!document.querySelector('input[placeholder="Give your post a title"]')`)));
  await navigate(alex, `/post/${postId}`);
  await until(alex, `!!document.querySelector('article')`, 'Alex post details');
  // A post's insights belong to its author: the panel is on the post page for the account that
  // wrote it, absent for everyone else, and the endpoint itself refuses a non-author rather than
  // answering the same numbers to whoever asks. The post here is `dummy`'s and already carries
  // one reaction from the step above, so the numbers have something to report.
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
  // Recency is what a reader wants here, and the exact instant has to stay
  // available: relative in the text, a real timestamp in `dateTime` and `title`.
  const freshComment = await evaluate(alex, `(() => {
    const node = [...document.querySelectorAll('article time[datetime]')].find(item => item.textContent.trim().length > 0);
    return node ? { text: node.textContent.trim(), title: node.getAttribute('title'), dateTime: node.getAttribute('datetime') } : null;
  })()`);
  assert(freshComment && /ago|now|yesterday/i.test(freshComment.text), `a freshly written item reads as relative: ${JSON.stringify(freshComment)}`);
  assert(freshComment.dateTime && freshComment.title, `the exact instant stays on the element: ${JSON.stringify(freshComment)}`);
  console.log('PASS: a comment carries an uploaded photo, renders it and stores its URL');

  // A post from somebody else, arriving over the socket, is offered rather than imposed:
  // the feed raises a sticky "New posts" pill and only the press folds the page in, so a
  // reader halfway down the list is not thrown back to the top. Both accounts are put on
  // the feed first, and the publish is retried because the frame is live-only — it must
  // not be sent before `dummy`'s socket has finished its handshake, and there is no DOM
  // signal for that handshake to wait on. The author is skipped by the server, and that
  // half is asserted too so the frame's contract cannot drift in silence.
  await navigate(dummy, '/');
  await navigate(alex, '/');
  await until(alex, `document.body.innerText.includes('Your feed')`, 'the second account is on the feed');
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

  // On a phone the same comment area is a bottom drawer rather than the inline list: shut
  // until the reader asks for it, opened by the comment button, dismissed with Escape.
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

  // The feed's Instagram overlay: clicking a post opens a pop-up — media on the left; header,
  // caption, the post's actions and the comments on the right, with the composer pinned at the
  // bottom. This is the desktop *feed* path the steps above never exercised: they read and write
  // comments off the `/post/{postId}` page, which stays the deep link and still opens `#comment-{id}`
  // inline, and the step they end on proves the phone's drawer. Escape closes the overlay and focus
  // returns to the picture that opened it; the phone step below proves the drawer, not this, is what
  // a narrow screen gets.
  await navigate(dummy, '/');
  const feedMedia = `article:has(a[href="/post/${postId}"]) button[aria-label^="Open image"]`;
  await until(dummy, `!!document.querySelector(${JSON.stringify(feedMedia)})`, 'the post is on the feed with its media');
  await clickAt(dummy, feedMedia);
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Post"]')`, 'the feed opens the post overlay');
  assert(await evaluate(dummy, `(() => { const dialog = document.querySelector('[role="dialog"][aria-label="Post"]'); return !!dialog.querySelector('img[alt="Post attachment"]') && !!dialog.querySelector('#comment-${postId}') && !!dialog.querySelector('button[aria-label="Like post"], button[aria-label="Unlike post"]'); })()`), 'the overlay holds the media, the composer and the post actions');
  const overlayDocument = await command('DOM.getDocument', {}, dummy);
  const overlayPicker = await command('DOM.querySelector', { nodeId: overlayDocument.root.nodeId, selector: '[role="dialog"][aria-label="Post"] input[aria-label="Add photos"]' }, dummy);
  await command('DOM.setFileInputFiles', { nodeId: overlayPicker.nodeId, files: [commentPhotoFixture] }, dummy);
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Post"] img[alt="Preview of comment-photo.png"]')`, 'the overlay previews a comment photo');
  await fill(dummy, `[role="dialog"][aria-label="Post"] #comment-${postId}`, `Overlay comment ${stamp}`);
  await evaluate(dummy, `[...document.querySelectorAll('[role="dialog"][aria-label="Post"] button')].find(button => button.textContent.trim() === 'Post').click()`);
  // Wait for this comment's own text, not just any `Comment attachment`: the post already carries a
  // comment photo from the post-page step above, so the generic selector would pass before this
  // write lands and the API read below would run too early.
  await until(dummy, `document.querySelector('[role="dialog"][aria-label="Post"]').innerText.includes(${JSON.stringify(`Overlay comment ${stamp}`)})`, 'the overlay shows the comment it wrote');
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Post"] img[alt="Comment attachment"]')`, 'the overlay renders the comment photo');
  const overlayComment = (await api(dummy, `/posts/comments?postId=${postId}`)).comments.find(item => item.commentText === `Overlay comment ${stamp}`);
  assert(overlayComment && overlayComment.imageUrls.length === 1, `the overlay comment is stored with its photo: ${JSON.stringify(overlayComment)}`);
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, dummy);
  await until(dummy, `!document.querySelector('[role="dialog"][aria-label="Post"]')`, 'Escape closes the overlay');
  assert(await evaluate(dummy, `document.activeElement?.getAttribute('aria-label')?.startsWith('Open image')`), 'focus returns to the picture that opened the overlay');
  console.log('PASS: the feed opens a post overlay that reads and writes a comment photo, and Escape returns focus');

  // On a phone the feed keeps the bottom drawer and is never offered the overlay.
  await command('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true }, dummy);
  await navigate(dummy, '/');
  const feedComments = `article:has(a[href="/post/${postId}"]) button[aria-label="Show comments"]`;
  await until(dummy, `!!document.querySelector(${JSON.stringify(feedComments)})`, 'the feed card offers the comment button on a phone');
  assert(!(await evaluate(dummy, `!!document.querySelector('[role="dialog"][aria-label="Post"]')`)), 'no overlay is offered on a phone');
  await evaluate(dummy, `document.querySelector(${JSON.stringify(feedComments)}).click()`);
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Comments"] #comment-${postId}')`, 'the phone feed opens the comment drawer');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, dummy);
  await until(dummy, `!document.querySelector('[role="dialog"][aria-label="Comments"]')`, 'Escape closes the drawer');
  await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false }, dummy);
  console.log('PASS: on a phone the feed opens the comment drawer, not the overlay');

  // The profile media tab lists comment photos next to post photos. The tile asks for one of
  // the server's derivatives rather than the original, so what identifies the photo here is its
  // URL up to the `?size=` — asserting the bare URL would now be asserting that the grid
  // downloads full-resolution originals, which is the opposite of what the app is for.
  await navigate(alex, '/profile');
  await until(alex, `!!document.querySelector('[aria-label="Profile statistics"]')`, 'own profile');
  // The header carries the Instagram shape: a posts count beside followers and following,
  // and the number is the profile resource's own rather than a guess from the loaded page.
  const ownProfileData = await api(alex, '/users/me');
  const shownPostCount = await evaluate(alex, `Number((document.querySelector('[aria-label="Post count"]')?.innerText.match(/[0-9]+/) || [NaN])[0])`);
  assert.equal(shownPostCount, ownProfileData.postCount, `the header shows the profile's own post count: ${shownPostCount} vs ${ownProfileData.postCount}`);
  await evaluate(alex, `[...document.querySelectorAll('button')].find(item => item.textContent.trim() === 'media').click()`);
  await until(alex, `[...document.querySelectorAll('a[href="/post/${postId}"] img')].some(image => { const src = image.getAttribute('src') || ''; return src.startsWith(${JSON.stringify(commentPhoto)}) && src.includes('size='); })`, 'comment photo in the profile media tab');
  // The grid is three columns of squares rather than two columns of fixed-height rectangles.
  const mediaGrid = await evaluate(alex, `(() => { const grid = document.querySelector('[data-media-grid]'); const tile = grid.querySelector('img'); const box = tile.getBoundingClientRect(); return { columns: getComputedStyle(grid).gridTemplateColumns.split(' ').length, square: Math.abs(box.width - box.height) < 1.5, width: Math.round(box.width) }; })()`);
  assert.equal(mediaGrid.columns, 3, `the media grid is three columns: ${JSON.stringify(mediaGrid)}`);
  assert(mediaGrid.square, `the media tiles are square: ${JSON.stringify(mediaGrid)}`);
  console.log('PASS: the profile header counts posts and the media tab is a three-column square grid');
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
  // The control is optimistic and the list did not change, so it must not be
  // re-read — not by the click, and not by the `social_changed` echo the follow
  // endpoint pushes to the actor as well as the target. The follower count is a
  // different, single resource and is still allowed to be re-read.
  assert.equal(requestsTo(alex, '/posts?liked='), postsRequestsBefore, `unfollowing must not refetch the profile post list: ${requestsMatching(alex, '/posts?liked=')}`);
  await until(dummy, stats(beforeFollow.followers.length - 1), 'owner sees live follower count');
  await button(alex, 'Follow');
  await until(alex, stats(beforeFollow.followers.length), 'follow restores follower count');
  assert.equal(requestsTo(alex, '/posts?liked='), postsRequestsBefore, `following must not refetch the profile post list either: ${requestsMatching(alex, '/posts?liked=')}`);
  await until(dummy, stats(beforeFollow.followers.length), 'owner sees restored count');
  console.log('PASS: profile follow/unfollow and live database counts');

  // A pending follow must not grant access to the private profile or its media.
  // The previous journey explicitly selected Alex; use follower-based access here.
  await api(dummy, `/posts/${postId}`, 'PUT', { ...restricted, privacy: 'followers', selectedFollowerIds: [] });
  await api(alex, `/users/${originalDummy.userId}/follow`, 'DELETE');
  const privateOwner = await api(dummy, '/users/me');
  await api(dummy, '/users/me', 'PUT', { ...privateOwner, isPublic: false });
  // The banner must not promise "everyone" for a public post on a private profile: the
  // server's rule for a public post still requires the viewer to follow the author, so
  // the wording has to narrow with the profile and say why.
  await navigate(dummy, '/create-post');
  await until(dummy, `!!document.querySelector('main select')`, 'the composer for a private profile');
  await fill(dummy, 'main select', 'public');
  await until(dummy, `document.querySelector('[aria-label="Audience"]')?.innerText.includes('Your profile is private')`, 'a private profile narrows even a public post');
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
  // The Instagram shell on a phone: the off-canvas drawer is gone and a bottom tab bar has
  // taken over. The bar has to be on screen (its bottom inside the viewport) while the
  // sidebar has to be `display:none` — which is the one thing a present-but-hidden element
  // can actually be asserted on.
  await until(dummy, `(() => { const bar = document.querySelector('nav[aria-label="Primary"]'); if (!bar) return false; const r = bar.getBoundingClientRect(); return r.height > 0 && r.bottom <= window.innerHeight + 1; })()`, 'mobile bottom tab bar is on screen');
  assert(await evaluate(dummy, `getComputedStyle(document.querySelector('aside[aria-label="Main navigation"]')).display === 'none'`), 'the sidebar is not shown on a phone');
  const mobileShot = await command('Page.captureScreenshot', { format: 'png' }, dummy);
  await writeFile(path.join(taskDir, 'mobile-chat.png'), Buffer.from(mobileShot.data, 'base64'));
  // A tab is a real link that navigates, which is the whole point of the bar replacing the drawer.
  await clickAt(dummy, 'nav[aria-label="Primary"] a[href="/search"]');
  await until(dummy, `location.pathname === '/search'`, 'the Search tab opens search');
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

  // The unified search page: one query, three surfaces. People and groups have had a
  // `q` for a while; the post half is the endpoint this change added, so the
  // assertion that matters most is that a term only the post carries brings it back.
  await navigate(dummy, '/search');
  await until(dummy, `!!document.querySelector('input[aria-label="Search posts, people and groups"]')`, 'search page');
  await fill(dummy, 'input[aria-label="Search posts, people and groups"]', `Updated ${stamp}`);
  await button(dummy, 'Search');
  await until(dummy, `location.search.includes('q=') && document.body.innerText.includes(${JSON.stringify(`Updated ${stamp}`)})`, 'the post search finds the post');
  await fill(dummy, 'input[aria-label="Search posts, people and groups"]', 'alexdemo');
  await button(dummy, 'Search');
  await until(dummy, `document.body.innerText.includes('@alexdemo')`, 'the people half finds Alex');
  await fill(dummy, 'input[aria-label="Search posts, people and groups"]', `Browser group ${stamp}`);
  await button(dummy, 'Search');
  await until(dummy, `document.body.innerText.includes(${JSON.stringify(`Browser group ${stamp}`)})`, 'the group half finds the group');
  // The terms are kept in this browser and offered back, including after a reload.
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
  // The strip is a tray of rings, not cards with the caption on them, so the proof the story
  // landed is its own item in the tray rather than its text appearing on the page.
  await until(dummy, `!!document.querySelector('[data-story-id="${storyId}"]')`, 'the story joins the tray');
  // Another account opens it, so the author's "seen by" list has someone to name.
  await api(alex, `/stories/${storyId}/view`, 'POST');
  // A story nobody has opened wears the unseen (gradient) ring...
  assert.equal(await evaluate(dummy, `document.querySelector('[data-story-ring]')?.dataset.storyRing`), 'unseen', 'a fresh story wears the unseen ring');
  // ...and opening it is what turns the ring and records the view for this reader alone.
  await evaluate(dummy, `document.querySelector('[data-story-ring]').closest('div').click()`);
  await until(dummy, `document.querySelector('[role="dialog"][aria-label="Story"]') !== null`, 'the story opens');
  assert.equal(await evaluate(dummy, `document.querySelector('[data-story-ring]')?.dataset.storyRing`), 'seen', 'opening a story turns its ring');
  // A story's author — and only the author — can see who opened it. Alex's API view above is
  // what the count reports; a reader's own viewer would not be offered the list at all.
  await until(dummy, `[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Seen by 1')`, 'the author is offered the viewer count');
  await button(dummy, 'Seen by 1');
  await until(dummy, `document.querySelector('[role="dialog"][aria-label="Story"]').innerText.includes('@alexdemo')`, 'the seen-by list names the viewer');
  console.log('PASS: a story shows its author who has seen it');
  await evaluate(dummy, `document.querySelector('button[aria-label="Close story"]').click()`);
  await until(dummy, `document.querySelector('[role="dialog"]') === null`, 'the story closes');
  assert.equal((await api(dummy, '/stories')).find(story => story.storyId === storyId).viewed, true, 'the view is recorded for this reader');
  // A reader replies through the story view, and its author — and only its author — reads it back
  // in the story's own replies panel, the sibling of the seen-by one.
  await navigate(alex, '/');
  await until(alex, `!!document.querySelector('[data-story-id="${storyId}"]')`, 'Alex sees the story in the tray');
  await evaluate(alex, `document.querySelector('[data-story-id="${storyId}"]').click()`);
  await until(alex, `!!document.querySelector('input[aria-label="Reply to story"]')`, 'a reader is offered the reply box');
  await fill(alex, 'input[aria-label="Reply to story"]', `Browser reply ${stamp}`);
  await evaluate(alex, `document.querySelector('button[aria-label="Send reply"]').click()`);
  await until(alex, `document.querySelector('input[aria-label="Reply to story"]').value === ''`, 'the reply is sent');
  await evaluate(alex, `document.querySelector('button[aria-label="Close story"]').click()`);
  await until(alex, `document.querySelector('[role="dialog"]') === null`, 'the reader closes the story');

  await navigate(dummy, '/');
  await until(dummy, `!!document.querySelector('[data-story-id="${storyId}"]')`, 'the author is back at the tray');
  await evaluate(dummy, `document.querySelector('[data-story-id="${storyId}"]').click()`);
  await until(dummy, `[...document.querySelectorAll('button')].some(button => button.textContent.trim() === 'Replies 1')`, 'the author is offered the reply count');
  await button(dummy, 'Replies 1');
  await until(dummy, `document.querySelector('[role="dialog"][aria-label="Story"]').innerText.includes(${JSON.stringify(`Browser reply ${stamp}`)})`, 'the author reads the reply');
  console.log('PASS: a story reply reaches its author alone');
  await evaluate(dummy, `document.querySelector('button[aria-label="Close story"]').click()`);
  await until(dummy, `document.querySelector('[role="dialog"]') === null`, 'the author closes the story');

  // A story that has expired is not gone: it is in the author's own archive, the list the strip
  // cannot show. The demo seed leaves one expired story behind, because nothing can pass a story's
  // real 24-hour life inside a run.
  await button(dummy, 'Your archive');
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

  // Reacting to a message: the heart is the reader's own and the total is shared, and it
  // is the same reaction endpoint the feed uses. The reaction is taken back at the end of
  // the step, so what follows still deletes the message from a clean slate.
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

  // The conversation's media tab: the attachments in the thread, and one opening in the same
  // lightbox the feed uses rather than in a new tab. The attachment is seeded through the API
  // because the composer path is already covered above.
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
  await evaluate(dummy, `[...document.querySelectorAll('nav[aria-label="Conversation tabs"] button')].find(candidate => candidate.textContent === 'Media').click()`);
  await until(dummy, `!!document.querySelector('button[aria-label="Open attachment 1"]')`, 'the media tab lists the attachment');
  await evaluate(dummy, `document.querySelector('button[aria-label="Open attachment 1"]').click()`);
  await until(dummy, `!!document.querySelector('[role="dialog"][aria-label="Conversation media viewer"]')`, 'the attachment opens in the lightbox');
  await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, dummy);
  await until(dummy, `!document.querySelector('[role="dialog"][aria-label="Conversation media viewer"]')`, 'the lightbox closes again');
  // Back to the thread, because the steps that follow type into the composer and the media
  // tab does not render one: leaving the conversation on the other tab would break them.
  await evaluate(dummy, `[...document.querySelectorAll('nav[aria-label="Conversation tabs"] button')].find(candidate => candidate.textContent === 'Chat').click()`);
  await until(dummy, `!!document.querySelector('textarea[aria-label="Message"]')`, 'the chat tab returns with its composer');
  console.log('PASS: a conversation lists its attachments, and one opens in the app rather than a new tab');

  // Fifty sockets through the frontend proxy at once, with one message that every
  // one of them has to receive: the hub's fan-out and Next's upgrade path are what a
  // single connection cannot exercise, and this is the only place both are real.
  //
  // Throughput and the limiter's ceiling are measured in Go instead, and deliberately:
  // this run shares one per-peer budget with every other step, and a burst big enough
  // to be interesting trips the 1200-a-minute limit — which 429s the rest of the suite
  // and, since a failed fetch is a console error, fails the guard at the end as well.
  // The Go harness has its own bucket and no other traffic.
  //
  // The handlers are attached when each socket is constructed, before its handshake
  // finishes: a frame that arrives with no handler attached is dropped by the
  // browser, which is how the first version of this step managed to open fifty
  // sockets and receive nothing.
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
  // The message goes over a socket rather than through the REST endpoint, because
  // the two push different frames: the REST path sends `message_changed` as a
  // refetch cue, while `incoming_msg` is what the socket delivery path fans out —
  // and the socket path is the one being loaded here.
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

  // The session is revoked under the open tab, so the next authenticated request is
  // answered 401 and the visitor lands on the login form. Which request that is cannot
  // be fixed: the sidebar's live-refresh poll may already be in flight. In the run that
  // first failed here (integration-1790759494435) the logout's answer and two 401s from
  // those polls arrived in the same millisecond, the tab had already been sent to
  // /login, and the composer this step meant to type into was gone — while the run
  // before it had no poll 401 at all and passed. So the send is attempted and reported,
  // and what is asserted is the contract both paths share: a 401 puts the reader in
  // front of the login form.
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

  // The same form with everything filled in: the chosen handle survives, About me
  // and the private choice land on the profile, and the photo is uploaded with
  // the session the signup just created.
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
  // Per-purpose rules: an avatar under 200×200 is refused before the upload is spent, with the
  // floor named, and the refused file is not added to the picker. The valid photo below is 256×256.
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
  // Password reset is the one flow that leaves the application, and there is no
  // inbox here. The backend's development mailer writes the message into its own
  // log, so the link is read from there — the only way a browser test can hold a
  // token the server never exposes. The account is the one just created, which
  // leaves the seeded account that later steps depend on untouched.
  const resetEmail = `browser-optional-${stamp}@example.com`;
  // These pages are reached the way /login is reached — Page.navigate directly —
  // because the shared navigate helper waits for the signed-in shell's sidebar, and
  // a visitor who cannot sign in has no shell.
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

  // The account that was signed in when the reset happened is signed out: a reset
  // ends every session it had, which is the whole point of the flow.
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

  // The dev-only component gallery: a route that shows the redesigned pieces on their own. It
  // is signed-in because it lives under the app shell, and it draws the audience banner the
  // preview carries, which is the piece the composer shares with the feed.
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
  // Responsive review, measured rather than eyeballed: each surface has to fit
  // the four widths the release list names without horizontal overflow, and the
  // failure message reports the widest node so a regression is actionable.
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
