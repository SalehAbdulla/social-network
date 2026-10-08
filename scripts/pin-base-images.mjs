#!/usr/bin/env node

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

async function manifest(repo, reference, what) {
  const response = await fetch(`${REGISTRY}/${repo}/manifests/${reference}`, {
    headers: { Authorization: `Bearer ${await token(repo)}`, Accept: ACCEPT },
  });
  if (!response.ok) {
    throw new Error(`${repo}:${reference} (${what}): HTTP ${response.status}`);
  }
  return { digest: response.headers.get('Docker-Content-Digest'), body: await response.json() };
}

async function toolchain(repo, digest, known) {
  const index = known ? { body: known } : await manifest(repo, digest, 'index for this digest');
  const amd64 = (index.body.manifests ?? []).find(entry =>
    entry.platform?.os === 'linux' && entry.platform?.architecture === 'amd64');
  if (!amd64) return '';
  const image = await manifest(repo, amd64.digest, 'linux/amd64 manifest');
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
    const { digest, body } = await manifest(repo, tag, 'tag');
    resolved.set(key, { digest, versions: await toolchain(repo, digest, body) });
  }
} catch (error) {
  console.error(`Could not resolve a base image from Docker Hub: ${error.message}`);
  if (error.message.includes('429')) {
    console.error('Docker Hub is rate limiting this address (anonymous pulls are capped per IP).');
    console.error('This is not drift and nothing was changed. Retry later, or from another network.');
  } else {
    console.error('A pin can only be checked with registry access, so nothing was changed.');
  }
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
