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
  assert(pkg.repository?.url?.includes('bez111/accord-protocol'), `${pkg.name}: repository.url should point to bez111/accord-protocol before org migration`);
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

const status = read('docs/status.md');
assert(status.includes('NOT CERTIFIED FOR MAINNET'), 'docs/status.md must include NOT CERTIFIED FOR MAINNET');
assert(status.includes('mainnetAllowed: true'), 'docs/status.md must describe the mainnetAllowed audit gate');

const security = read('SECURITY.md');
assert(security.includes('NOT CERTIFIED FOR MAINNET'), 'SECURITY.md must include NOT CERTIFIED FOR MAINNET');

const changelog = read('CHANGELOG.md');
assert(changelog.includes('## [0.4.0]'), 'CHANGELOG.md must contain a v0.4.0 release entry before tag');

const publishNpm = read('.github/workflows/publish-npm.yml');
assert(!publishNpm.includes('workflow_dispatch'), 'publish-npm.yml should not allow manual workflow_dispatch publishing');
assert(publishNpm.includes('- ergo-agent-pay') && publishNpm.includes('- ergo-agent-scripts') && publishNpm.includes('- agentpay-base'), 'accord-conformance publish job should depend on legacy foundation packages');
assert(publishNpm.includes('npm test -w ergo-agent-cli'), 'ergo-agent-cli publish job should run tests');
assert(publishNpm.includes('npm test -w ergo-agent-mcp'), 'ergo-agent-mcp publish job should run tests');

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
