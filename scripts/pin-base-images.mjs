#!/usr/bin/env node
// Pins every upstream base image this repository builds or runs on to the digest
// its tag resolves to today, and reports when a pin has fallen behind.
//
//   node scripts/pin-base-images.mjs           # check: 0 current, 1 drift, 2 cannot resolve
//   node scripts/pin-base-images.mjs --write   # rewrite the pins in place
//
// Why a script rather than digests written by hand: the Dockerfiles deliberately
// float their Go patch (`golang:1.26-bookworm`), because govulncheck's
// standard-library findings are fixed by building on a current patch. Pinning a
// digest freezes that patch, so the pin needs something that notices when it is
// behind — this check, which reads the toolchain straight out of the image
// config. Pinning without it would quietly reintroduce the findings the float
// was clearing.
//
// Only the names in UPSTREAM are touched; the locally built images in
// compose.yaml (social-network-backend, social-network-frontend) are left alone.
// Needs Docker Hub reachable and nothing else: no Docker daemon, no dependencies.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--write');
const FILES = ['backend/Dockerfile', 'frontend/Dockerfile', '.gitlab-ci.yml'];
const UPSTREAM = ['golang', 'debian', 'node', 'docker'];
const REGISTRY = 'https://registry-1.docker.io/v2';
const AUTH = 'https://auth.docker.io/token?service=registry.docker.io&scope=repository:';
const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');
const REPORTED = ['GOLANG_VERSION', 'NODE_VERSION', 'DOCKER_VERSION'];

// `FROM golang:1.26-bookworm AS build`, `image: node:22-bookworm`, `- docker:27-dind`
// `FROM golang:1.26-bookworm@sha256:… AS build`, `image: node:22-bookworm@sha256:…`,
// `- docker:27-dind@sha256:…`. The pin keeps its `sha256:` prefix so it compares
// equal to the registry's Docker-Content-Digest and can be used as a reference.
const REFERENCE = /^(?<lead>\s*(?:FROM\s+|-\s+|image:\s*))(?<name>[a-z0-9][\w./-]*):(?<tag>[\w][\w.-]*)(?:@(?<pin>sha256:[0-9a-f]{64}))?(?<tail>(?:\s+AS\s+\w+)?\s*)$/;

const tokens = new Map();
async function token(repo) {
  if (!tokens.has(repo)) {
    const response = await fetch(AUTH + repo + ':pull');
    if (!response.ok) throw new Error(`token for ${repo}: HTTP ${response.status}`);
    tokens.set(repo, (await response.json()).token);
  }
  return tokens.get(repo);
}

async function manifest(repo, reference) {
  const response = await fetch(`${REGISTRY}/${repo}/manifests/${reference}`, {
    headers: { Authorization: `Bearer ${await token(repo)}`, Accept: ACCEPT },
  });
  if (!response.ok) throw new Error(`${repo}:${reference}: HTTP ${response.status}`);
  return { digest: response.headers.get('Docker-Content-Digest'), body: await response.json() };
}

// The toolchain a tag (or a pin) carries, read from the linux/amd64 image config.
async function toolchain(repo, digest) {
  const index = await manifest(repo, digest);
  const amd64 = (index.body.manifests ?? []).find(entry =>
    entry.platform?.os === 'linux' && entry.platform?.architecture === 'amd64');
  if (!amd64) return '';
  const image = await manifest(repo, amd64.digest);
  const response = await fetch(`${REGISTRY}/${repo}/blobs/${image.body.config.digest}`, {
    headers: { Authorization: `Bearer ${await token(repo)}` },
  });
  if (!response.ok) return '';
  const found = [];
  for (const entry of (await response.json()).config?.Env ?? []) {
    const [key, ...rest] = entry.split('=');
    if (REPORTED.includes(key)) found.push(`${key.split('_')[0].toLowerCase()}${rest.join('=')}`);
  }
  return found.join(' ');
}

const references = [];
for (const file of FILES) {
  const lines = (await readFile(path.join(root, file), 'utf8')).split('\n');
  lines.forEach((line, index) => {
    const match = REFERENCE.exec(line);
    if (match && UPSTREAM.includes(match.groups.name)) {
      references.push({ file, index, ...match.groups });
    }
  });
}
if (references.length === 0) {
  console.error('No upstream base images found; the file list or the patterns are out of date.');
  process.exit(2);
}

const resolved = new Map();
try {
  for (const key of new Set(references.map(reference => `${reference.name}:${reference.tag}`))) {
    const [name, tag] = key.split(':');
    const repo = `library/${name}`;
    const { digest } = await manifest(repo, tag);
    resolved.set(key, { digest, versions: await toolchain(repo, digest) });
  }
} catch (error) {
  console.error(`Could not resolve a base image from Docker Hub: ${error.message}`);
  console.error('A pin can only be checked with registry access, so nothing was changed.');
  process.exit(2);
}

const rewritten = new Map();
let behind = 0;
for (const reference of references) {
  const latest = resolved.get(`${reference.name}:${reference.tag}`);
  const label = `${reference.file}:${reference.index + 1}`;
  const versions = latest.versions ? `  (${latest.versions})` : '';
  if (reference.pin === latest.digest) {
    console.log(`current   ${label}  ${reference.name}:${reference.tag}${versions}`);
    continue;
  }
  behind += 1;
  const pinned = reference.pin
    ? await toolchain(`library/${reference.name}`, reference.pin).catch(() => '')
    : '';
  const change = pinned && latest.versions ? `  was (${pinned})` : '';
  console.log(`${reference.pin ? 'behind  ' : 'unpinned'}  ${label}  ${reference.name}:${reference.tag}${versions}${change}`);
  if (apply) {
    const lines = rewritten.get(reference.file)
      ?? (await readFile(path.join(root, reference.file), 'utf8')).split('\n');
    rewritten.set(reference.file, lines);
    lines[reference.index] = `${reference.lead}${reference.name}:${reference.tag}@${latest.digest}${reference.tail}`;
  }
}

for (const [file, lines] of rewritten) {
  await writeFile(path.join(root, file), lines.join('\n'));
}
if (apply && behind > 0) {
  console.log(`Pinned ${behind} reference(s) in ${rewritten.size} file(s).`);
} else if (!apply && behind > 0) {
  console.log(`${behind} of ${references.length} reference(s) behind. Run with --write to pin them.`);
}
process.exit(apply || behind === 0 ? 0 : 1);
