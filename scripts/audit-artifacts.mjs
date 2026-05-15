import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export const requiredAuditDocs = [
  'docs/status.md',
  'SECURITY.md',
  'docs/audit/README.md',
  'docs/audit/AUDITOR_REQUEST.md',
  'docs/audit/ASSUMPTIONS.md',
  'docs/audit/MANIFEST_FORMAT.md',
  'docs/audit/MAINNET_CERTIFICATION.md',
  'docs/audit/SIGNING_PLAYBOOK.md',
  'docs/audit/PRE_AUDIT_FINDINGS.md',
  'docs/audit/RESOLUTION.md',
  'docs/audit/DEEP_REVIEW.md',
  'docs/audit/MAINNET_ERGOTREE_AUDIT.md',
  'docs/dev-vs-production.md',
  'docs/cross-chain.md',
];

const exactFiles = [
  ...requiredAuditDocs,
  'package.json',
  'package-lock.json',
];

const artifactDirs = [
  'specs',
  'schemas',
  'test-vectors',
  'registry',
  'packages/accord-core/src',
  'packages/accord-mcp/src',
  'packages/accord-gateway/src',
  'packages/accord-rails/src',
  'packages/accord-rails-ergo/src',
  'packages/accord-rails-rosen/src',
  'packages/accord-rails-base/src',
  'packages/accord-rails-x402/src',
  'packages/accord-conformance/src',
  'packages/accord-buyer-policy/src',
  'packages/ergo-agent-pay/src',
  'packages/ergo-agent-mcp/src',
  'packages/ergo-agent-api/src',
  'packages/ergo-agent-scripts/data',
  'packages/ergo-agent-scripts/src',
  'packages/ergo-agent-rosen/src',
  'packages/agentpay-base/contracts',
  'packages/agentpay-base/data',
  'packages/agentpay-base/src',
];

const allowedExt = new Set([
  '.cjs',
  '.cts',
  '.es',
  '.js',
  '.json',
  '.md',
  '.mjs',
  '.sol',
  '.ts',
  '.txt',
]);

const ignoredNames = new Set([
  'dist',
  'fixtures',
  'node_modules',
  '__pycache__',
]);

function toPosix(p) {
  return p.split(path.sep).join('/');
}

function walk(root, relDir, out) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir)) return;
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (ignoredNames.has(entry.name)) continue;
    const rel = toPosix(path.join(relDir, entry.name));
    const abs = path.join(root, rel);
    if (entry.isDirectory()) {
      walk(root, rel, out);
    } else if (entry.isFile() && allowedExt.has(path.extname(entry.name))) {
      out.add(rel);
    }
  }
}

export function collectAuditArtifacts(root = process.cwd()) {
  const artifacts = new Set();
  for (const rel of exactFiles) {
    if (fs.existsSync(path.join(root, rel))) artifacts.add(rel);
  }
  for (const dir of artifactDirs) {
    walk(root, dir, artifacts);
  }
  return [...artifacts].sort();
}

export function sha256File(absPath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(absPath));
  return hash.digest('hex');
}
