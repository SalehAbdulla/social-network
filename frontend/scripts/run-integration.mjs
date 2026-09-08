import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { cp, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backend = path.resolve(frontend, '../backend');
const taskDir = path.join(backend, 'tmp', `integration-${Date.now()}`);
await mkdir(taskDir, { recursive: true });
await cp(path.join(backend, 'pkg/db/migrations'), path.join(taskDir, 'pkg/db/migrations'), { recursive: true });
const env = { ...process.env, GOCACHE: process.env.GOCACHE || path.join(backend, 'tmp/go-build') };
if (process.platform === 'win32' && existsSync('C:/msys64/mingw64/bin/gcc.exe')) {
  const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') || 'PATH';
  env[pathKey] = `C:/msys64/mingw64/bin;${env[pathKey] || ''}`;
}
const suffix = process.platform === 'win32' ? '.exe' : '';

function run(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, { cwd: backend, env, windowsHide: true, stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', code => code === 0 ? resolve() : reject(new Error(`${path.basename(program)} exited with ${code}`)));
  });
}
async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
const services = [];
const logs = [];
function start(name, program, args, options) {
  const log = createWriteStream(path.join(taskDir, `${name}.log`));
  logs.push(log);
  const child = spawn(program, args, { windowsHide: true, ...options, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on('error', error => { child.startError = error; });
  services.push(child);
  return child;
}
async function ready(child, url, expectedStatus) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (child.startError) throw child.startError;
    if (child.exitCode !== null) throw new Error(`Service exited. See logs in ${taskDir}`);
    try { if ((await fetch(url, { signal: AbortSignal.timeout(5000) })).status === expectedStatus) return; } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out starting ${url}. See logs in ${taskDir}`);
}

try {
  console.log('Building the backend and seeding an isolated demo database...');
  const executable = path.join(taskDir, `backend${suffix}`);
  const seed = path.join(taskDir, `seed${suffix}`);
  await run('go', ['build', '-o', executable, './cmd']);
  await run('go', ['build', '-o', seed, './cmd/seed']);
  await run(seed, ['-demo'], { cwd: taskDir });
  const backendPort = await freePort();
  const frontendPort = await freePort();
  const base = `http://127.0.0.1:${frontendPort}`;
  const backendURL = `http://127.0.0.1:${backendPort}`;
  const api = start('backend', executable, [], {
    cwd: taskDir, env: { ...env, PORT: String(backendPort), APP_ENV: 'development', DEV_DUMMY_USER: 'true', FRONTEND_ORIGIN: base, UPLOAD_DIR: path.join(taskDir, 'uploads') },
  });
  await ready(api, `${backendURL}/api/v1/users/me`, 401);
  console.log('Starting the frontend against the isolated backend...');
  const web = start('frontend', process.execPath, [path.join(frontend, 'node_modules/next/dist/bin/next'), 'dev', '-p', String(frontendPort)], {
    cwd: frontend, env: { ...env, NODE_ENV: 'development', NEXT_PUBLIC_DEV_USER: 'true', BACKEND_URL: backendURL, NEXT_DIST_DIR: '.next-smoke', NEXT_TELEMETRY_DISABLED: '1' },
  });
  await ready(web, base, 200);
  await run(process.execPath, ['scripts/integration-smoke.mjs'], { cwd: frontend, env: { ...env, BASE_URL: base, TEST_ARTIFACT_DIR: taskDir } });
} finally {
  for (const child of services.reverse()) {
    if (child.exitCode !== null || !child.pid) continue;
    if (process.platform === 'win32') await run('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' }).catch(() => {});
    else child.kill('SIGTERM');
  }
  for (const log of logs) log.end();
  console.log(`Integration logs and artifacts: ${taskDir}`);
}
