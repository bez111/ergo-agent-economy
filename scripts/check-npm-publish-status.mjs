#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const registry = 'https://registry.npmjs.org';
const errors = [];

function readJson(relPath) {
  return JSON.parse(fs.readFileSync(path.join(root, relPath), 'utf8'));
}

function encodePackageName(name) {
  return encodeURIComponent(name).replace(/^%40/, '@');
}

async function registryLatest(name) {
  const res = await fetch(`${registry}/${encodePackageName(name)}`, {
    headers: { accept: 'application/vnd.npm.install-v1+json' },
  });

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`${name}: npm registry returned ${res.status}`);

  const body = await res.json();
  return body?.['dist-tags']?.latest ?? null;
}

async function registryHasVersion(name, version) {
  const res = await fetch(`${registry}/${encodePackageName(name)}/${version}`, {
    headers: { accept: 'application/json' },
  });

  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`${name}@${version}: npm registry returned ${res.status}`);
  return true;
}

const rootPkg = readJson('package.json');
const publishable = [];

for (const workspace of rootPkg.workspaces ?? []) {
  const pkgPath = path.join(workspace, 'package.json');
  const abs = path.join(root, pkgPath);
  if (!fs.existsSync(abs)) continue;

  const pkg = readJson(pkgPath);
  if (pkg.private === true) continue;
  if (pkg.publishConfig?.access !== 'public') continue;

  publishable.push({
    name: pkg.name,
    version: pkg.version,
    path: workspace,
  });
}

for (const pkg of publishable) {
  try {
    pkg.latest = await registryLatest(pkg.name);
    pkg.versionPublished = await registryHasVersion(pkg.name, pkg.version);
  } catch (error) {
    errors.push(error.message);
  }
}

if (errors.length) {
  console.error('npm publish status check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const pending = publishable.filter((pkg) => !pkg.versionPublished);
const published = publishable.filter((pkg) => pkg.versionPublished);

console.log('npm publish status');
console.log('');
console.log('| Package | Local | Registry latest | Status |');
console.log('|---|---:|---:|---|');
for (const pkg of publishable.sort((a, b) => a.name.localeCompare(b.name))) {
  const latest = pkg.latest ?? 'unpublished';
  const status = pkg.versionPublished ? 'already published' : 'needs publish';
  console.log(`| ${pkg.name} | ${pkg.version} | ${latest} | ${status} |`);
}

console.log('');
console.log(`${published.length}/${publishable.length} package version(s) already published; ${pending.length} pending.`);

if (pending.length) {
  console.log('');
  console.log('Pending package versions:');
  for (const pkg of pending) console.log(`- ${pkg.name}@${pkg.version}`);
}
