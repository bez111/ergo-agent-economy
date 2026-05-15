import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();

const protocolObjects = [
  {
    family: 'agreement',
    schema: 'schemas/agreement.v0.schema.json',
    vectors: 'test-vectors/agreement/v0',
    spec: 'specs/ACCORD-001-agreement-object.md',
    requiredInvalids: [
      'invalid-amount-as-number.json',
      'invalid-deadline-trailing-junk.json',
      'invalid-reserved-accord-field.json',
    ],
  },
  {
    family: 'verification-receipt',
    schema: 'schemas/verification-receipt.v0.schema.json',
    vectors: 'test-vectors/verification-receipt/v0',
    spec: 'specs/ACCORD-002-verification-receipt.md',
    requiredInvalids: [
      'invalid-agreement-hash-algorithm.json',
      'invalid-reserved-accord-field.json',
    ],
  },
  {
    family: 'settlement-receipt',
    schema: 'schemas/settlement-receipt.v0.schema.json',
    vectors: 'test-vectors/settlement-receipt/v0',
    spec: 'specs/ACCORD-003-settlement-receipt.md',
    requiredInvalids: [
      'invalid-agreement-hash-algorithm.json',
      'invalid-mode-for-rail.json',
      'invalid-reserved-accord-field.json',
    ],
  },
];

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
}

function readText(rel) {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

function assertIncludes(rel, needles) {
  const text = readText(rel);
  for (const needle of needles) {
    assert(text.includes(needle), `${rel} must mention ${needle}`);
  }
}

for (const item of protocolObjects) {
  const schema = readJson(item.schema);
  assert(
    schema.propertyNames?.not?.pattern === '^accord_',
    `${item.schema} must reject the reserved accord_ top-level namespace`,
  );

  for (const invalidName of item.requiredInvalids) {
    const invalidPath = path.join(item.vectors, invalidName);
    assert(exists(invalidPath), `${invalidPath} is required`);
  }

  const invalidReserved = path.join(item.vectors, 'invalid-reserved-accord-field.json');
  assert(
    Object.keys(readJson(invalidReserved)).some((key) => key.startsWith('accord_')),
    `${invalidReserved} must exercise the reserved namespace`,
  );

  if (item.family === 'agreement') {
    assert(
      schema.$defs?.payment?.properties?.deadline?.pattern ===
        '^(\\+[0-9]+ (blocks|seconds)|[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z)$',
      `${item.schema} must fully anchor payment.deadline alternatives`,
    );
  }

  const vectorDir = path.join(root, item.vectors);
  const jsonVectors = fs
    .readdirSync(vectorDir)
    .filter((name) => name.endsWith('.json'))
    .sort();
  assert(jsonVectors.length > 0, `${item.vectors} must contain JSON vectors`);
  assert(
    jsonVectors.some((name) => name.startsWith('invalid-')),
    `${item.vectors} must contain invalid vectors`,
  );

  for (const name of jsonVectors.filter((name) => !name.startsWith('invalid-'))) {
    const base = name.replace(/\.json$/, '');
    assert(
      exists(path.join(item.vectors, `${base}.canonical.txt`)),
      `${item.vectors}/${base}.canonical.txt is required`,
    );
    assert(
      exists(path.join(item.vectors, `${base}.hash.txt`)),
      `${item.vectors}/${base}.hash.txt is required`,
    );
  }

  assertIncludes(item.spec, ['accord_', 'must be rejected']);
}

for (let i = 0; i <= 10; i += 1) {
  const prefix = `ACCORD-${String(i).padStart(3, '0')}`;
  const specExists = fs
    .readdirSync(path.join(root, 'specs'))
    .some((name) => name.startsWith(prefix) && name.endsWith('.md'));
  assert(specExists, `${prefix} spec is required`);
}

assertIncludes('docs/PROTOCOL_COMPATIBILITY.md', [
  'Changes requiring a new object version',
  'accord_',
  'L0-L4',
  'Registry policy',
]);

assertIncludes('docs/policy-engine.md', [
  '@accord-protocol/buyer-policy',
  'Decision Semantics',
  'Signer Context',
  'Replay Boundary',
]);

assertIncludes('specs/ACCORD-002-verification-receipt.md', [
  'ACCORD_AGREEMENT_MISMATCH',
  'ACCORD_HASH_MISMATCH',
  'resolved parent Agreement',
]);

assertIncludes('specs/ACCORD-003-settlement-receipt.md', [
  'ACCORD_AGREEMENT_MISMATCH',
  'ACCORD_RAIL_MISMATCH',
  'ACCORD_CURRENCY_MISMATCH',
  'resolved parent Agreement',
]);

assertIncludes('specs/ACCORD-009-conformance.md', [
  'agreement id/hash',
  'structured `ok=false`',
]);

assertIncludes('registry/README.md', [
  'descriptive',
  'not an audit authority',
  'per-rail manifest',
]);

assertIncludes('specs/ACCORD-008-registry.md', [
  'descriptive',
  'mainnetAllowed: true',
  'hosted service',
]);

console.log('protocol hardening check passed');
