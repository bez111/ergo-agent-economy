#!/usr/bin/env node
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const requireFromRoot = createRequire(path.join(root, 'cjs-smoke.cjs'));

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function cjsEntries(pkg, pkgDir) {
  const entries = [];
  if (pkg.exports && typeof pkg.exports === 'object' && !Array.isArray(pkg.exports)) {
    for (const [subpath, target] of Object.entries(pkg.exports)) {
      if (subpath.includes('*')) continue;
      if (target && typeof target === 'object' && typeof target.require === 'string') {
        entries.push({
          specifier: subpath === '.' ? pkg.name : `${pkg.name}${subpath.slice(1)}`,
          target: target.require,
        });
      } else if (typeof target === 'string' && target.endsWith('.cjs')) {
        entries.push({
          specifier: subpath === '.' ? pkg.name : `${pkg.name}${subpath.slice(1)}`,
          target,
        });
      }
    }
  }

  if (entries.length === 0 && typeof pkg.main === 'string' && pkg.main.endsWith('.cjs')) {
    entries.push({ specifier: pkg.name, target: pkg.main });
  }

  return entries.map((entry) => ({
    ...entry,
    targetPath: entry.target.startsWith('./') ? path.join(pkgDir, entry.target) : null,
  }));
}

const rootPkg = readJson(path.join(root, 'package.json'));
const workspaceDirs = (rootPkg.workspaces ?? [])
  .filter((workspace) => workspace.startsWith('packages/'))
  .map((workspace) => path.join(root, workspace))
  .filter((workspaceDir) => fs.existsSync(path.join(workspaceDir, 'package.json')));

const checked = [];
const failures = [];

for (const pkgDir of workspaceDirs) {
  const pkgPath = path.join(pkgDir, 'package.json');
  const pkg = readJson(pkgPath);
  for (const entry of cjsEntries(pkg, pkgDir)) {
    if (entry.targetPath && !fs.existsSync(entry.targetPath)) {
      failures.push(`${pkg.name}: missing ${entry.target}`);
      continue;
    }

    try {
      const mod = requireFromRoot(entry.specifier);
      const exportCount = mod && (typeof mod === 'object' || typeof mod === 'function')
        ? Object.keys(mod).length
        : 0;
      checked.push({ ...entry, exportCount });
    } catch (err) {
      failures.push(`${entry.specifier}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

if (checked.length === 0) {
  failures.push('no CommonJS exports found to check');
}

if (failures.length > 0) {
  console.error('CommonJS export smoke failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

const packageCount = new Set(
  checked.map((entry) =>
    entry.specifier
      .split('/')
      .slice(0, entry.specifier.startsWith('@') ? 2 : 1)
      .join('/'),
  ),
).size;
console.log(`CommonJS export smoke passed: ${checked.length} specifiers across ${packageCount} packages.`);
for (const entry of checked) {
  console.log(`- ${entry.specifier} -> ${entry.target} (${entry.exportCount} exports)`);
}
