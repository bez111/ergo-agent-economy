#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const errors = [];
const warnings = [];

function exists(p) {
  return fs.existsSync(path.join(root, p));
}

function read(p) {
  return fs.readFileSync(path.join(root, p), 'utf8');
}

function readJson(p) {
  return JSON.parse(read(p));
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function warn(condition, message) {
  if (!condition) warnings.push(message);
}

const accordPackages = [
  ['packages/accord-core/package.json', '@accord-protocol/core'],
  ['packages/accord-mcp/package.json', '@accord-protocol/mcp'],
  ['packages/accord-gateway/package.json', '@accord-protocol/gateway'],
  ['packages/accord-rails/package.json', '@accord-protocol/rails'],
  ['packages/accord-rails-ergo/package.json', '@accord-protocol/rails-ergo'],
  ['packages/accord-rails-rosen/package.json', '@accord-protocol/rails-rosen'],
  ['packages/accord-rails-base/package.json', '@accord-protocol/rails-base'],
  ['packages/accord-rails-x402/package.json', '@accord-protocol/rails-x402'],
  ['packages/accord-conformance/package.json', '@accord-protocol/conformance'],
  ['packages/accord-buyer-policy/package.json', '@accord-protocol/buyer-policy'],
];

const referencePackages = [
  ['packages/ergo-agent-pay/package.json', 'ergo-agent-pay'],
  ['packages/ergo-agent-cli/package.json', 'ergo-agent-cli'],
  ['packages/ergo-agent-api/package.json', 'ergo-agent-api'],
  ['packages/ergo-agent-mcp/package.json', 'ergo-agent-mcp'],
  ['packages/ergo-agent-server/package.json', 'ergo-agent-server'],
  ['packages/ergo-agent-scripts/package.json', 'ergo-agent-scripts'],
  ['packages/ergo-agent-rosen/package.json', 'ergo-agent-rosen'],
  ['packages/agentpay-base/package.json', 'agentpay-base'],
];

for (const [pkgPath, expectedName] of accordPackages) {
  assert(exists(pkgPath), `${pkgPath} is missing`);
  if (!exists(pkgPath)) continue;
  const pkg = readJson(pkgPath);
  assert(pkg.name === expectedName, `${pkgPath}: expected name ${expectedName}, got ${pkg.name}`);
  assert(pkg.version === '0.4.0', `${pkg.name}: expected version 0.4.0, got ${pkg.version}`);
  assert(pkg.license === 'MIT', `${pkg.name}: missing MIT license`);
  assert(pkg.publishConfig?.access === 'public', `${pkg.name}: publishConfig.access must be public`);
  assert(pkg.repository?.url?.includes('accord-protocol/accord-protocol'), `${pkg.name}: repository.url should point to accord-protocol/accord-protocol`);
  assert(pkg.repository?.directory, `${pkg.name}: repository.directory missing`);
  assert(pkg.homepage, `${pkg.name}: homepage missing`);
  assert(pkg.bugs?.url, `${pkg.name}: bugs.url missing`);
  assert(pkg.files?.includes('dist'), `${pkg.name}: files should include dist`);
  assert(pkg.files?.includes('README.md'), `${pkg.name}: files should include README.md`);
}

for (const [pkgPath, expectedName] of referencePackages) {
  assert(exists(pkgPath), `${pkgPath} is missing`);
  if (!exists(pkgPath)) continue;
  const pkg = readJson(pkgPath);
  assert(pkg.name === expectedName, `${pkgPath}: expected name ${expectedName}, got ${pkg.name}`);
  assert(pkg.version === '0.3.0', `${pkg.name}: expected version 0.3.0, got ${pkg.version}`);
  assert(pkg.license === 'MIT', `${pkg.name}: missing MIT license`);
  assert(pkg.publishConfig?.access === 'public', `${pkg.name}: publishConfig.access must be public`);
  assert(pkg.repository?.directory, `${pkg.name}: repository.directory missing`);
  assert(pkg.homepage, `${pkg.name}: homepage missing`);
  assert(pkg.bugs?.url, `${pkg.name}: bugs.url missing`);
}

const pyproject = read('packages/ergo-agent-py/pyproject.toml');
assert(pyproject.includes('version = "0.3.0"'), 'Python pyproject.toml must remain version 0.3.0 for reference rail release');
const pyInit = read('packages/ergo-agent-py/ergo_agent_pay/__init__.py');
assert(pyInit.includes('__version__ = "0.3.0"'), 'Python __init__.py must remain version 0.3.0');
assert(exists('LICENSE'), 'root LICENSE file must exist');
assert(exists('scripts/check-cjs-exports.mjs'), 'CommonJS export smoke script must exist');
assert(exists('.github/ISSUE_TEMPLATE/release_work.md'), 'release-work issue template must exist');

const rootPkg = readJson('package.json');
assert(rootPkg.workspaces?.includes('examples/15-paid-mcp-repo-audit'), 'examples/15-paid-mcp-repo-audit must remain a tested workspace demo');
assert(rootPkg.workspaces?.includes('examples/16-paid-mcp-ergo-testnet'), 'examples/16-paid-mcp-ergo-testnet must remain a tested workspace demo');
assert(rootPkg.scripts?.['cjs:check'] === 'node scripts/check-cjs-exports.mjs', 'package.json must expose npm run cjs:check');
assert(rootPkg.scripts?.['release:preflight'] === 'node scripts/release-preflight.mjs', 'package.json must expose npm run release:preflight');
assert(rootPkg.scripts?.['release:preflight:pack'] === 'node scripts/release-preflight.mjs --pack', 'package.json must expose npm run release:preflight:pack');
const example16Pkg = readJson('examples/16-paid-mcp-ergo-testnet/package.json');
assert(example16Pkg.scripts?.typecheck === 'tsc --noEmit', 'example 16 workspace must expose npm run typecheck');
assert(Boolean(example16Pkg.scripts?.test), 'example 16 workspace must expose npm test');

const pilotDocs = [
  'docs/testnet-wallet-setup.md',
  'docs/pilots/README.md',
  'docs/pilots/result-template.md',
  'docs/pilots/mock-mcp-paid-tool.md',
  'docs/pilots/ergo-testnet-note-settlement.md',
  'docs/pilots/rosen-wrapped-token-architecture.md',
  'docs/pilots/base-sepolia-contract-rail.md',
  'docs/pilots/x402-facilitator-integration.md',
];

for (const pilotDoc of pilotDocs) {
  assert(exists(pilotDoc), `${pilotDoc} must exist for P4 pilot readiness`);
}
assert(
  exists('docs/pilots/results/2026-05-15-mock-mcp-paid-tool.md'),
  'docs/pilots/results/2026-05-15-mock-mcp-paid-tool.md must preserve the completed mock pilot result',
);

function assertLocalMarkdownLinks(docPath) {
  const dir = path.dirname(docPath);
  const linkPattern = /\[[^\]]+\]\(([^)]+)\)/g;
  const markdownWithoutCode = read(docPath)
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`\n]+`/g, '');
  for (const match of markdownWithoutCode.matchAll(linkPattern)) {
    const href = match[1].split('#')[0];
    if (!href || href.startsWith('http://') || href.startsWith('https://') || href.startsWith('mailto:')) continue;
    const target = path.normalize(path.join(dir, href));
    assert(exists(target), `${docPath} has a broken local link: ${href}`);
  }
}

function collectMarkdownFiles(dir, output = []) {
  if (!exists(dir)) return output;
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (['.git', 'node_modules', 'dist'].includes(entry.name)) continue;
      if (rel === 'docs/basis') continue;
      collectMarkdownFiles(rel, output);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      output.push(rel);
    }
  }
  return output;
}

for (const pilotDoc of pilotDocs) {
  if (exists(pilotDoc)) assertLocalMarkdownLinks(pilotDoc);
}

const pilotReadme = read('docs/pilots/README.md');
assert(pilotReadme.includes('No pilot in this folder certifies mainnet use'), 'docs/pilots/README.md must preserve mainnet warning');
assert(pilotReadme.includes('result-template.md'), 'docs/pilots/README.md must link the pilot result template');
assert(pilotReadme.includes('results/2026-05-15-mock-mcp-paid-tool.md'), 'docs/pilots/README.md must link the completed mock pilot result');
const mockPilotResult = read('docs/pilots/results/2026-05-15-mock-mcp-paid-tool.md');
assert(mockPilotResult.includes('| Result | `pass` |'), 'mock pilot result must record pass status');
assert(mockPilotResult.includes('Achieved: L4'), 'mock pilot result must include conformance L4 evidence');
assert(mockPilotResult.includes('does not certify mainnet use'), 'mock pilot result must preserve the mainnet warning');
const example16Readme = read('examples/16-paid-mcp-ergo-testnet/README.md');
assert(example16Readme.includes('docs/testnet-wallet-setup.md'), 'example 16 must link the testnet wallet setup guide');

const status = read('docs/status.md');
assert(status.includes('NOT CERTIFIED FOR MAINNET'), 'docs/status.md must include NOT CERTIFIED FOR MAINNET');
assert(status.includes('mainnetAllowed: true'), 'docs/status.md must describe the mainnetAllowed audit gate');

const contributing = read('CONTRIBUTING.md');
assert(contributing.includes('NOT CERTIFIED FOR MAINNET'), 'CONTRIBUTING.md must preserve the mainnet warning');
assert(contributing.includes('npm run cjs:check'), 'CONTRIBUTING.md must document cjs:check');
assert(contributing.includes('npm run release:check'), 'CONTRIBUTING.md must document release:check');
assert(contributing.includes('npm run release:preflight -- --allow-branch --pack'), 'CONTRIBUTING.md must document branch release preflight');
assert(!contributing.includes('Every example must work on Ergo testnet with real API calls'), 'CONTRIBUTING.md must not contain stale Ergo-only example guidance');

const pullRequestTemplate = read('.github/pull_request_template.md');
assert(pullRequestTemplate.includes('npm run release:check'), 'pull request template must prompt for release:check when relevant');
assert(pullRequestTemplate.includes('npm run release:preflight -- --allow-branch --pack'), 'pull request template must prompt for branch release preflight when relevant');
const releaseIssueTemplate = read('.github/ISSUE_TEMPLATE/release_work.md');
assert(releaseIssueTemplate.includes('No audit manifest is promoted to `mainnetAllowed: true`'), 'release issue template must preserve mainnet safety posture');
assert(releaseIssueTemplate.includes('npm run release:preflight -- --allow-branch --pack'), 'release issue template must prompt for branch release preflight');

const packageMatrix = read('docs/PACKAGE_MATRIX.md');
for (const [, expectedName] of [...accordPackages, ...referencePackages]) {
  assert(packageMatrix.includes(expectedName), `docs/PACKAGE_MATRIX.md must mention ${expectedName}`);
}
assert(packageMatrix.includes('ergo-agent-pay` Python'), 'docs/PACKAGE_MATRIX.md must mention the Python ergo-agent-pay package');
assert(packageMatrix.includes('NOT') || packageMatrix.includes('Not certified'), 'docs/PACKAGE_MATRIX.md must preserve a conservative mainnet posture');

const releaseChecklist = read('docs/RELEASE-CHECKLIST.md');
assert(releaseChecklist.includes('npm run cjs:check'), 'docs/RELEASE-CHECKLIST.md must document cjs:check');
assert(releaseChecklist.includes('npm run release:preflight -- --allow-branch --pack'), 'docs/RELEASE-CHECKLIST.md must document PR-branch pack smoke');
assert(releaseChecklist.includes('npm run release:preflight:pack'), 'docs/RELEASE-CHECKLIST.md must document main-branch pack smoke');
assert(releaseChecklist.includes('including the Python reference package tests'), 'docs/RELEASE-CHECKLIST.md must state release preflight includes Python tests');
assert(releaseChecklist.includes('installs all 18 packages into a fresh temporary project'), 'docs/RELEASE-CHECKLIST.md must describe install-in-tempdir package smoke');
assert(releaseChecklist.includes('runs the packaged `accord-conformance` CLI from outside the repository root'), 'docs/RELEASE-CHECKLIST.md must describe packaged conformance CLI smoke');

const exampleModes = read('docs/EXAMPLE_MODES.md');
for (const entry of fs.readdirSync(path.join(root, 'examples'), { withFileTypes: true })) {
  if (entry.isDirectory()) {
    assert(exampleModes.includes(entry.name), `docs/EXAMPLE_MODES.md must mention examples/${entry.name}`);
  }
}
assert(exampleModes.includes('No example in this repository is mainnet-certified'), 'docs/EXAMPLE_MODES.md must preserve the mainnet warning');

for (const [docPath, banned] of [
  ['docs/api-reference.md', 'Compiled reserve script (production)'],
  ['packages/ergo-agent-rosen/README.md', 'network: "mainnet"'],
  ['packages/ergo-agent-rosen/README.md', 'published mainnet config JSON'],
  ['packages/ergo-agent-rosen/README.md', 'audited `basis_token_reserve_v0` tree'],
  ['packages/accord-rails-rosen/README.md', 'ROSEN_MAINNET'],
  ['packages/accord-rails-rosen/README.md', 'peer deps for production use'],
  ['packages/accord-rails-rosen/src/types.ts', 'ROSEN_MAINNET'],
  ['packages/accord-rails-rosen/src/types.ts', 'Example mainnet'],
  ['examples/11-cross-chain-rosen/README.md', 'rosen-mainnet-tokens.json'],
  ['examples/11-cross-chain-rosen/README.md', 'Rosen mainnet TokenMap JSON'],
  ['examples/11-cross-chain-rosen/agent.ts', 'REPLACE_AFTER_SUBMISSION'],
  ['examples/11-cross-chain-rosen/package.json', 'audited basis_token_reserve_v0'],
  ['docs/launch/README.md', 'public launch of `ergo-agent-economy` v0.3.0'],
  ['docs/launch/x-thread.md', "What's audited:"],
  ['docs/launch/hn-launch.md', 'Audited compiled ergoTrees'],
  ['docs/launch/discord-announcement.md', 'pay sub-agents in real money'],
  ['docs/launch/discord-announcement.md', 'built-in escrow'],
  ['docs/launch/mcp-so-listing.md', 'Testnet works fully'],
]) {
  assert(!read(docPath).includes(banned), `${docPath} must not include legacy mainnet-ready wording: ${banned}`);
}

const stalePrWording = /\b(?:PR-\d+|PR\s*#\d+|PR#\d+|this PR)\b/i;
const publicReadmeDocs = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'docs/api-reference.md',
  'docs/canonical-json.md',
  'docs/EXAMPLE_MODES.md',
  'docs/PACKAGE_MATRIX.md',
  'docs/status.md',
  'registry/README.md',
  ...fs.readdirSync(path.join(root, 'packages'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `packages/${entry.name}/README.md`)
    .filter(exists),
  ...fs.readdirSync(path.join(root, 'examples'), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => `examples/${entry.name}/README.md`)
    .filter(exists),
];

for (const docPath of publicReadmeDocs) {
  assert(!stalePrWording.test(read(docPath)), `${docPath} must not include stale PR-number wording`);
}

const markdownDocs = [
  'README.md',
  'CONTRIBUTING.md',
  'SECURITY.md',
  'CHANGELOG.md',
  'PUBLISHING.md',
  'RELEASING.md',
  ...collectMarkdownFiles('docs'),
  ...collectMarkdownFiles('examples'),
  ...collectMarkdownFiles('packages'),
  ...collectMarkdownFiles('registry'),
].filter((docPath, index, all) => exists(docPath) && all.indexOf(docPath) === index);

for (const docPath of markdownDocs) {
  assertLocalMarkdownLinks(docPath);
}

const security = read('SECURITY.md');
assert(security.includes('NOT CERTIFIED FOR MAINNET'), 'SECURITY.md must include NOT CERTIFIED FOR MAINNET');

const changelog = read('CHANGELOG.md');
assert(changelog.includes('## [0.4.0]'), 'CHANGELOG.md must contain a v0.4.0 release entry before tag');

const publishNpm = read('.github/workflows/publish-npm.yml');
assert(publishNpm.includes('workflow_dispatch'), 'publish-npm.yml should allow manual workflow_dispatch reruns after publish fixes');
assert(publishNpm.includes('already on npm; skipping.'), 'publish-npm.yml manual reruns must stay idempotent via skip-if-already-published guards');
assert(publishNpm.includes('- ergo-agent-pay') && publishNpm.includes('- ergo-agent-scripts') && publishNpm.includes('- agentpay-base'), 'accord-conformance publish job should depend on legacy foundation packages');
assert(publishNpm.includes('npm test -w ergo-agent-cli'), 'ergo-agent-cli publish job should run tests');
assert(publishNpm.includes('npm test -w ergo-agent-mcp'), 'ergo-agent-mcp publish job should run tests');
const releaseReadinessWorkflow = read('.github/workflows/ci-release-readiness.yml');
assert(releaseReadinessWorkflow.includes('npm run cjs:check'), 'ci-release-readiness.yml must run CommonJS export smoke after build');
assert(releaseReadinessWorkflow.includes('CONTRIBUTING.md'), 'ci-release-readiness.yml must run when CONTRIBUTING.md changes');
const releasePreflight = read('scripts/release-preflight.mjs');
assert(releasePreflight.includes('npm", ["run", "cjs:check"]'), 'release-preflight must run npm run cjs:check');
assert(releasePreflight.includes('CommonJS export smoke'), 'release-preflight must name the CommonJS export smoke gate');
assert(releasePreflight.includes('Python reference package tests'), 'release-preflight must run Python reference package tests');
assert(releasePreflight.includes('packaged conformance L4'), 'release-preflight must run packaged conformance CLI smoke');

function collectMainnetAllowed(value, locations = [], pathParts = []) {
  if (Array.isArray(value)) {
    value.forEach((v, i) => collectMainnetAllowed(v, locations, [...pathParts, String(i)]));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (k === 'mainnetAllowed' && v === true) {
        locations.push([...pathParts, k].join('.'));
      }
      collectMainnetAllowed(v, locations, [...pathParts, k]);
    }
  }
  return locations;
}

for (const manifestPath of [
  'packages/ergo-agent-scripts/data/AUDITED_ERGOTREES.json',
  'packages/agentpay-base/data/AUDITED_CONTRACTS.json',
]) {
  if (!exists(manifestPath)) continue;
  const manifest = readJson(manifestPath);
  const promoted = collectMainnetAllowed(manifest);
  assert(promoted.length === 0, `${manifestPath}: has mainnetAllowed=true entries: ${promoted.join(', ')}`);
}

if (warnings.length) {
  console.log('Warnings:');
  for (const message of warnings) console.log(`- ${message}`);
  console.log('');
}

if (errors.length) {
  console.error('Release readiness check failed:');
  for (const message of errors) console.error(`- ${message}`);
  process.exit(1);
}

console.log('Release readiness check passed.');
