// Reports the JavaScript and CSS one build ships, by route and in total.
//
// The numbers come from the build's own output rather than from a bundle analyser: Next writes
// one `<route>_client-reference-manifest.js` per route, and each names the chunks that route's
// client references load — so this reports what the browser is actually told to fetch, with no
// extra dependency to add. A chunk shared by several routes is counted once per route that
// loads it, because that is what a reader of that route pays, and the chunk table names the
// heaviest chunks by the routes that pull them, which is where a size problem is actionable.
//
//   npm run build && npm run size
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const dist = path.resolve(process.argv[2] || '.next');
const manifestRoot = path.join(dist, 'server', 'app');

const manifests = [];
(function walk(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (entry.endsWith('_client-reference-manifest.js')) manifests.push(full);
  }
})(manifestRoot);

if (!manifests.length) {
  console.error(`No route manifests under ${path.relative(process.cwd(), manifestRoot)}: run \`npm run build\` first.`);
  process.exit(1);
}

// Sizes are cached because a chunk shared by twenty routes would otherwise be stat'ed twenty times.
const sizes = new Map();
function size(relative) {
  if (!sizes.has(relative)) {
    try { sizes.set(relative, statSync(path.join(dist, relative)).size); }
    catch { sizes.set(relative, 0); }
  }
  return sizes.get(relative);
}

const chunkPattern = /static\/chunks\/[\w.-]+\.(?:js|css)/g;
const byRoute = new Map();
const byChunk = new Map();
for (const file of manifests) {
  const source = readFileSync(file, 'utf8');
  const relative = path.relative(manifestRoot, path.dirname(file)).split(path.sep).join('/');
  const route = relative === '' ? '/' : `/${relative}`;
  const referenced = [...new Set([...source.matchAll(chunkPattern)].map(match => match[0]))];
  const js = referenced.filter(chunk => chunk.endsWith('.js'));
  for (const chunk of js) byChunk.set(chunk, [...(byChunk.get(chunk) ?? []), route]);
  byRoute.set(route, {
    js: js.reduce((total, chunk) => total + size(chunk), 0),
    css: referenced.filter(chunk => chunk.endsWith('.css')).reduce((total, chunk) => total + size(chunk), 0),
    chunks: js.length,
  });
}

// The framework is a separate line because it is not any one route's to trim: it is what the
// router itself costs before a page renders.
const build = JSON.parse(readFileSync(path.join(dist, 'build-manifest.json'), 'utf8'));
const framework = [...(build.polyfillFiles ?? []), ...(build.rootMainFiles ?? [])];
const frameworkBytes = framework.reduce((total, chunk) => total + size(chunk), 0);

const kb = value => `${(value / 1024).toFixed(1)} kB`;
const routes = [...byRoute.entries()].sort((a, b) => b[1].js - a[1].js);
const width = Math.max(...routes.map(([route]) => route.length));
const totalJs = routes.reduce((total, [, route]) => total + route.js, 0);

console.log(`Frontend bundle as built in ${path.relative(process.cwd(), dist) || '.'}`);
console.log(`${routes.length} routes; their JavaScript sums to ${kb(totalJs)} and their CSS to ${kb(routes.reduce((t, [, r]) => t + r.css, 0))}.`);
console.log(`Every route also loads ${kb(frameworkBytes)} of framework across ${framework.length} chunks.\n`);
console.log('Largest routes (a chunk shared with another route is counted in both):');
for (const [route, entry] of routes.slice(0, 12)) {
  console.log(`  ${route.padEnd(width)}  ${kb(entry.js).padStart(9)}  ${kb(entry.css).padStart(8)}  ${entry.chunks} chunks`);
}
console.log('\nLargest chunks:');
const chunks = [...byChunk.entries()]
  .map(([chunk, on]) => ({ chunk, on, bytes: size(chunk) }))
  .sort((a, b) => b.bytes - a.bytes);
for (const { chunk, on, bytes } of chunks.slice(0, 12)) {
  const shown = on.slice(0, 3).join(', ') + (on.length > 3 ? ` +${on.length - 3} more` : '');
  console.log(`  ${kb(bytes).padStart(9)}  ${chunk}  ${shown}`);
}
