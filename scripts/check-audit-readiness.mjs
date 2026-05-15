#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { collectAuditArtifacts, requiredAuditDocs } from './audit-artifacts.mjs';

const root = process.cwd();
const errors = [];

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function readJson(rel) {
  return JSON.parse(read(rel));
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function collectFiles(relDir, files = []) {
  const absDir = path.join(root, relDir);
  if (!fs.existsSync(absDir)) return files;
  for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const rel = path.join(relDir, entry.name);
    if (entry.isDirectory()) collectFiles(rel, files);
    else files.push(rel);
  }
  return files;
}

for (const rel of requiredAuditDocs) {
  assert(exists(rel), `${rel} is required for audit readiness`);
}

assert(exists('scripts/audit-handoff.mjs'), 'scripts/audit-handoff.mjs is required');
assert(exists('scripts/audit-artifacts.mjs'), 'scripts/audit-artifacts.mjs is required');

const pkg = readJson('package.json');
assert(pkg.scripts?.['audit:check'] === 'node scripts/check-audit-readiness.mjs', 'package.json must expose npm run audit:check');
assert(pkg.scripts?.['audit:handoff'] === 'node scripts/audit-handoff.mjs', 'package.json must expose npm run audit:handoff');

const artifacts = collectAuditArtifacts(root);
assert(artifacts.length >= 100, `audit handoff should include a broad artifact set, got ${artifacts.length}`);
for (const rel of [
  'packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json',
  'packages/agentpay-base/data/AUDITED_CONTRACTS.json',
  'packages/ergo-agent-pay/src/safety.ts',
  'packages/agentpay-base/src/safety.ts',
  'packages/accord-conformance/src/l3-security.ts',
]) {
  assert(artifacts.includes(rel), `audit handoff artifacts must include ${rel}`);
}

const auditorRequest = exists('docs/audit/AUDITOR_REQUEST.md')
  ? read('docs/audit/AUDITOR_REQUEST.md')
  : '';
for (const required of [
  'npm run audit:check',
  'npm run audit:handoff',
  'packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json',
  'packages/agentpay-base/data/AUDITED_CONTRACTS.json',
  'packages/accord-conformance/src/l3-security.ts',
]) {
  assert(auditorRequest.includes(required), `AUDITOR_REQUEST.md must mention ${required}`);
}

const assumptions = exists('docs/audit/ASSUMPTIONS.md')
  ? read('docs/audit/ASSUMPTIONS.md')
  : '';
for (const heading of [
  'Verifier Assumptions',
  'Wallet And Signer Assumptions',
  'Bridge Assumptions',
  'Facilitator Assumptions',
]) {
  assert(assumptions.includes(heading), `ASSUMPTIONS.md must include ${heading}`);
}

const ergoManifest = readJson('packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json');
assert(ergoManifest.status === 'draft-pre-audit', 'AUDITED_ERGOTREES.json must stay draft-pre-audit before external audit');
assert(ergoManifest.entries.length > 0, 'AUDITED_ERGOTREES.json must list ErgoTree entries');
for (const entry of ergoManifest.entries) {
  assert(entry.sourcePath, `${entry.name}: sourcePath missing`);
  assert(entry.sourceHashBlake2b256, `${entry.name}: sourceHashBlake2b256 missing`);
  assert(entry.treeHashBlake2b256, `${entry.name}: treeHashBlake2b256 missing`);
  assert(entry.mainnetAllowed === false, `${entry.name}: mainnetAllowed must remain false before signed audit`);
}

const baseManifest = readJson('packages/agentpay-base/data/AUDITED_CONTRACTS.json');
assert(baseManifest.status === 'draft-pre-audit', 'AUDITED_CONTRACTS.json must stay draft-pre-audit before external audit');
for (const entry of baseManifest.entries) {
  assert(entry.bytecodeHashKeccak256, `${entry.name}: bytecodeHashKeccak256 missing`);
  assert(entry.mainnetAllowed === false, `${entry.name}: mainnetAllowed must remain false before signed audit`);
}

const examplesText = collectFiles('examples')
  .filter((rel) => /\.(js|mjs|ts|tsx|md)$/.test(rel))
  .map((rel) => read(rel))
  .join('\n');
assert(!/dangerouslyAllow|allowInsecureDevMode/.test(examplesText), 'examples must not use dangerous mainnet override flags');

const ergoSafetyTest = read('packages/ergo-agent-pay/src/__tests__/safety.test.ts');
assert(ergoSafetyTest.includes('rejects mainnet without a script'), 'Ergo safety tests must cover the mainnet box-shape gate');
assert(ergoSafetyTest.includes('rejects when no auditPolicy'), 'Ergo safety tests must cover the mainnet audit-identity gate');

const baseSafetyTest = read('packages/agentpay-base/src/__tests__/safety.test.ts');
assert(baseSafetyTest.includes('rejects without auditPolicy'), 'Base safety tests must cover the mainnet audit gate');

const l3Test = read('packages/accord-conformance/src/__tests__/l3.test.ts');
assert(l3Test.includes('L3.ergo.mainnet-no-script-rejected'), 'Conformance L3 must assert Ergo no-script rejection');
assert(l3Test.includes('L3.ergo.mainnet-no-audit-policy-rejected'), 'Conformance L3 must assert Ergo no-audit-policy rejection');
assert(l3Test.includes('L3.base.mainnet-no-audit-policy-rejected'), 'Conformance L3 must assert Base no-audit-policy rejection');

if (errors.length) {
  console.error('Audit readiness check failed:');
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Audit readiness check passed: ${artifacts.length} handoff artifacts tracked.`);
