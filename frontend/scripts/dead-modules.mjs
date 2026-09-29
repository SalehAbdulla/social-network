// Reports source modules nothing imports.
//
// Spot-checking for dead files has missed them twice in this repository (a
// component whose only importer was itself dead reads as "used" if the check is
// done by name), so this resolves every relative import to its target and inverts
// the graph instead. Next.js route files are entry points by convention and are
// skipped.
//
//   node scripts/dead-modules.mjs
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [];
(function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) walk(full);
    else if (/\.(tsx?|jsx?)$/.test(entry)) files.push(full);
  }
})(path.join(root, 'src'));

const isEntryPoint = full => /(^|\/)(page|layout|error|not-found|route)\.[jt]sx?$/.test(full)
  || full === path.join(root, 'src', 'proxy.ts');

const importers = new Map(files.map(file => [file, []]));
for (const file of files) {
  const source = readFileSync(file, 'utf8');
  const specs = [...source.matchAll(/(?:from|import|require)\s*\(?\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
  for (const spec of specs) {
    if (!spec.startsWith('.')) continue;
    const resolved = path.resolve(path.dirname(file), spec);
    for (const candidate of [resolved, `${resolved}.ts`, `${resolved}.tsx`, `${resolved}.js`, `${resolved}.jsx`,
      path.join(resolved, 'index.ts'), path.join(resolved, 'index.tsx')]) {
      if (importers.has(candidate)) importers.get(candidate).push(path.relative(root, file));
    }
  }
}

let dead = 0;
for (const file of files.sort()) {
  if (isEntryPoint(file) || importers.get(file).length > 0) continue;
  dead++;
  console.log(`NO IMPORTER  ${path.relative(root, file)}`);
}
console.log(`\n${dead} module(s) with no importer, out of ${files.length} source files`);
process.exit(dead === 0 ? 0 : 1);
