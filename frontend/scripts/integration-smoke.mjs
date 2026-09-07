import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const base = process.env.BASE_URL || 'http://localhost:4000';
const taskDir = path.resolve('../backend/tmp/browser-check');
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
socket.addEventListener('message', async ({ data }) => {
  const event = JSON.parse(String(data));
  if (event.id) {
    const entry = pending.get(event.id); if (!entry) return;
    pending.delete(event.id); clearTimeout(entry.timer);
    if (event.error) entry.reject(new Error(JSON.stringify(event.error))); else entry.resolve(event.result);
  }
  if (event.method === 'Runtime.exceptionThrown') exceptions.push(event.params.exceptionDetails.text + ': ' + (event.params.exceptionDetails.exception?.description || ''));
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
  throw new Error(`Timed out: ${label}\n${await evaluate(page, 'document.body.innerText')}`);
}
async function createPage() {
  const { browserContextId } = await command('Target.createBrowserContext');
  const { targetId } = await command('Target.createTarget', { url: 'about:blank', browserContextId });
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
  await command('Runtime.enable', {}, sessionId);
  await command('Page.enable', {}, sessionId);
  // Keep the smoke test offline except for the local application.
  await command('Fetch.enable', { patterns: [{ urlPattern: '*' }] }, sessionId);
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
async function api(page, route, method = 'GET', body) {
  const result = await evaluate(page, `(async () => { const response = await fetch('/api/v1' + ${JSON.stringify(route)}, { method: ${JSON.stringify(method)}, headers: { 'Content-Type': 'application/json' }, ${body === undefined ? '' : `body: JSON.stringify(${JSON.stringify(body)}),`} credentials: 'include' }); const result = await response.json(); if (!response.ok || !result.success) throw new Error(JSON.stringify(result)); return result.data; })()`);
  return result;
}
const stamp = String(Date.now());
let dummy, alex, originalDummy, originalAlex, postId, storyId, mediaURL;
try {
  dummy = await createPage();
  await navigate(dummy, '/');
  originalDummy = await api(dummy, '/users/me');
  assert.equal(originalDummy.nickname, 'dummyuser');
  console.log('PASS: frontend bootstraps the dummy session through the same-origin proxy');

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

  alex = await createPage();
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
  const notifications = await api(dummy, '/notifications');
  assert(notifications.notifications.some(item => item.entityType === 'comment' && item.actorId === originalAlex.userId));
  console.log('PASS: second user comments and the post owner receives a notification');

  await navigate(alex, '/discover');
  await until(alex, `document.body.innerText.includes('@dummyuser')`, 'discover users');
  if (!originalAlex.following.includes(originalDummy.userId)) await button(alex, 'Follow');
  await pause(500);
  if (!originalAlex.connections.includes(originalDummy.userId) && !originalAlex.requested.includes(originalDummy.userId)) {
    await button(alex, 'Connect');
    await until(alex, `document.body.innerText.includes('Request sent')`, 'connection request');
    await navigate(dummy, '/connections');
    await evaluate(dummy, `[...document.querySelectorAll('button')].find(button => button.textContent.includes('Received requests')).click()`);
    await until(dummy, `document.body.innerText.includes('@alexdemo')`, 'incoming request');
    await button(dummy, 'Accept');
    await until(dummy, `(async () => (await (await fetch('/api/v1/users/me')).json()).data.connections.includes(${JSON.stringify(originalAlex.userId)}))()`, 'accept request');
  }
  console.log('PASS: discovery, follow and connection acceptance');

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
  await button(dummy, 'Send');
  await until(alex, `document.body.innerText.includes(${JSON.stringify(`Browser message ${stamp}`)})`, 'live message receipt', 10000);
  await until(dummy, `document.body.innerText.includes('read')`, 'message read receipt', 10000);
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

  await navigate(dummy, '/');
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
  await writeFile(path.join(taskDir, 'result.json'), JSON.stringify({ postId, storyId, mediaURL, exceptions }, null, 2));
  await command('Browser.close').catch(() => {});
  socket.close();
  browser.kill();
}
