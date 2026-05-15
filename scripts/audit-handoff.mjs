#!/usr/bin/env node
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { collectAuditArtifacts, sha256File } from './audit-artifacts.mjs';

const root = process.cwd();

function parseArgs(argv) {
  const out = {
    allowDirty: false,
    dryRun: false,
    outDir: 'dist/audit-handoff',
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--allow-dirty') out.allowDirty = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--out') {
      const value = argv[++i];
      if (!value) throw new Error('--out requires a directory');
      out.outDir = value;
    } else if (arg === '--help' || arg === '-h') {
      printUsage();
      process.exit(0);
    } else {
      throw new Error(`unknown flag: ${arg}`);
    }
  }
  return out;
}

function printUsage() {
  console.log(`Usage: node scripts/audit-handoff.mjs [--dry-run] [--allow-dirty] [--out dist/audit-handoff]

Creates a deterministic auditor handoff directory containing:
- files/ with the exact audit input files, preserving repository paths;
- audit-handoff.manifest.json with commit, dirty state, sizes, and sha256 hashes;
- README.md with auditor commands and mainnet certification guardrails.

By default, a real handoff refuses a dirty working tree. Use --dry-run while
developing, or --allow-dirty only for intentional draft bundles.`);
}

function git(args) {
  try {
    return childProcess.execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch {
    return null;
  }
}

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function assertSafeOutDir(outDir) {
  const absOut = path.resolve(root, outDir);
  const absRoot = path.resolve(root);
  if (!absOut.startsWith(absRoot + path.sep)) {
    throw new Error(`refusing to write outside repository: ${outDir}`);
  }
  if (absOut === absRoot) {
    throw new Error('refusing to use repository root as output directory');
  }
  return absOut;
}

function manifestSummary() {
  const ergo = readJson('packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json');
  const base = readJson('packages/agentpay-base/data/AUDITED_CONTRACTS.json');
  return {
    ergo: {
      path: 'packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json',
      schema: ergo.schema,
      status: ergo.status,
      commit: ergo.commit,
      entries: ergo.entries.map((entry) => ({
        name: entry.name,
        sourcePath: entry.sourcePath,
        sourceHashBlake2b256: entry.sourceHashBlake2b256,
        postTemplateSourceHashBlake2b256: entry.postTemplateSourceHashBlake2b256,
        treeHashBlake2b256: entry.treeHashBlake2b256,
        mainnetAllowed: entry.mainnetAllowed,
      })),
    },
    base: {
      path: 'packages/agentpay-base/data/AUDITED_CONTRACTS.json',
      schema: base.schema,
      status: base.status,
      entries: base.entries.map((entry) => ({
        name: entry.name,
        network: entry.network,
        address: entry.address,
        bytecodeHashKeccak256: entry.bytecodeHashKeccak256,
        mainnetAllowed: entry.mainnetAllowed,
      })),
    },
  };
}

function writeReadme(outDir, handoff) {
  const readme = `# Accord Protocol Audit Handoff

Generated at: ${handoff.generatedAt}
Repository: ${handoff.repo}
Handoff commit: ${handoff.commit}
Working tree dirty: ${handoff.dirty}

## Verification

1. Confirm the repository commit and dirty flag above.
2. Recompute sha256 for each file listed in \`audit-handoff.manifest.json\`.
3. Review \`docs/audit/AUDITOR_REQUEST.md\` for scope and expected deliverables.
4. Review \`docs/audit/ASSUMPTIONS.md\` for verifier, wallet, bridge, and facilitator assumptions.
5. Rebuild or independently verify the ErgoTree and bytecode hashes before signing any manifest.

## Mainnet Rule

This handoff does not certify mainnet use. Mainnet remains blocked until an
external auditor signs the relevant manifest and maintainers update only the
approved artifact entries to \`mainnetAllowed: true\`.
`;
  fs.writeFileSync(path.join(outDir, 'README.md'), readme);
}

const args = parseArgs(process.argv.slice(2));
const commit = git(['rev-parse', 'HEAD']) ?? 'unknown';
const branch = git(['branch', '--show-current']) ?? 'unknown';
const status = git(['status', '--short']) ?? '';
const dirty = status.length > 0;

if (dirty && !args.allowDirty && !args.dryRun) {
  throw new Error('working tree is dirty; commit changes first or pass --allow-dirty for a draft handoff');
}

const artifacts = collectAuditArtifacts(root).map((rel) => {
  const abs = path.join(root, rel);
  return {
    path: rel,
    size: fs.statSync(abs).size,
    sha256: sha256File(abs),
  };
});

const handoff = {
  schema: 'accord-protocol/audit-handoff/v1',
  repo: 'accord-protocol/accord-protocol',
  branch,
  commit,
  dirty,
  generatedAt: new Date().toISOString(),
  artifactCount: artifacts.length,
  artifacts,
  manifests: manifestSummary(),
};

if (args.dryRun) {
  console.log(`Audit handoff dry run: ${artifacts.length} artifacts`);
  console.log(`branch: ${branch}`);
  console.log(`commit: ${commit}`);
  console.log(`dirty: ${dirty}`);
  process.exit(0);
}

const absOut = assertSafeOutDir(args.outDir);
fs.rmSync(absOut, { recursive: true, force: true });
fs.mkdirSync(path.join(absOut, 'files'), { recursive: true });

for (const artifact of artifacts) {
  const src = path.join(root, artifact.path);
  const dst = path.join(absOut, 'files', artifact.path);
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

fs.writeFileSync(
  path.join(absOut, 'audit-handoff.manifest.json'),
  JSON.stringify(handoff, null, 2) + '\n'
);
writeReadme(absOut, handoff);

console.log(`Audit handoff written to ${path.relative(root, absOut)}`);
console.log(`Artifacts: ${artifacts.length}`);
console.log(`Manifest: ${path.relative(root, path.join(absOut, 'audit-handoff.manifest.json'))}`);
