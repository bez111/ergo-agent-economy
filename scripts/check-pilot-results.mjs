#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const resultsDir = path.join(root, 'docs/pilots/results');
const errors = [];
const allowedResults = new Set(['pass', 'fail', 'inconclusive']);
const failureClasses = new Set([
  'verifier',
  'rail',
  'settlement',
  'wallet',
  'bridge',
  'facilitator',
  'policy',
  'documentation',
]);

function rel(abs) {
  return path.relative(root, abs);
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function stripTicks(value) {
  return value.trim().replace(/^`|`$/g, '').trim();
}

function summaryTable(markdown) {
  const rows = markdown.match(/^\|[^|\n]+\|[^|\n]+\|$/gm) ?? [];
  const fields = new Map();
  for (const row of rows) {
    const cells = row.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 2) continue;
    const [field, value] = cells;
    if (!field || field === 'Field' || /^-+$/.test(field)) continue;
    fields.set(field, value);
  }
  return fields;
}

function section(markdown, heading) {
  const token = `## ${heading}`;
  const start = markdown.indexOf(token);
  if (start === -1) return '';
  const rest = markdown.slice(start + token.length);
  const next = rest.search(/\n## /);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function firstJsonBlock(markdown) {
  const match = markdown.match(/```json\s*([\s\S]*?)```/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

function requireHeading(markdown, file, heading) {
  assert(markdown.includes(`## ${heading}`), `${file} must include ## ${heading}`);
}

if (!fs.existsSync(resultsDir)) {
  errors.push('docs/pilots/results must exist');
} else {
  const files = fs
    .readdirSync(resultsDir)
    .filter((name) => name.endsWith('.md'))
    .sort();

  assert(files.length > 0, 'docs/pilots/results must contain at least one pilot result');

  const readme = fs.readFileSync(path.join(root, 'docs/pilots/README.md'), 'utf8');

  for (const fileName of files) {
    const abs = path.join(resultsDir, fileName);
    const file = rel(abs);
    const markdown = fs.readFileSync(abs, 'utf8');
    const dateFromName = fileName.match(/^(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/)?.[1];

    assert(Boolean(dateFromName), `${file} must use YYYY-MM-DD-slug.md naming`);
    assert(readme.includes(`results/${fileName}`), `docs/pilots/README.md must link ${file}`);

    for (const heading of [
      'Summary',
      'Scenario',
      'Commands',
      'Expected Receipts',
      'Observed Receipts',
      'Explorer / External Evidence',
      'Failure Classification',
      'Rollback',
      'Notes',
    ]) {
      requireHeading(markdown, file, heading);
    }

    const summary = summaryTable(markdown);
    for (const field of ['Pilot', 'Date', 'Operator', 'Git commit', 'Network', 'Result']) {
      assert(summary.has(field) && stripTicks(summary.get(field) ?? '') !== '', `${file}: summary field ${field} is required`);
    }

    const date = stripTicks(summary.get('Date') ?? '');
    if (dateFromName) assert(date === dateFromName, `${file}: Date must match filename date ${dateFromName}`);

    const commit = stripTicks(summary.get('Git commit') ?? '');
    assert(/^[0-9a-f]{7,40}$/i.test(commit), `${file}: Git commit must be a 7-40 character hex commit`);

    const result = stripTicks(summary.get('Result') ?? '').toLowerCase();
    assert(allowedResults.has(result), `${file}: Result must be pass, fail, or inconclusive`);

    const observed = firstJsonBlock(section(markdown, 'Observed Receipts'));
    assert(observed && typeof observed === 'object', `${file}: Observed Receipts must contain valid JSON`);

    for (const key of [
      'agreement_id',
      'agreement_hash',
      'verification_receipt_id',
      'settlement_receipt_id',
      'settlement_tx_id',
      'conformance_result',
    ]) {
      assert(Object.hasOwn(observed ?? {}, key), `${file}: Observed Receipts JSON must include ${key}`);
      if (result === 'pass') {
        assert(String(observed?.[key] ?? '').trim() !== '', `${file}: ${key} must be non-empty for passing pilots`);
      }
    }

    if (result === 'pass') {
      assert(
        /Achieved: L\d|L0|L1|L2|L3|L4/i.test(String(observed?.conformance_result ?? '')),
        `${file}: passing pilots must include conformance level evidence`,
      );
    }

    const failureText = section(markdown, 'Failure Classification');
    if (result === 'pass') {
      assert(/\bNone\b/i.test(failureText), `${file}: passing pilots should classify failure as None`);
    } else {
      const matched = [...failureClasses].filter((name) => new RegExp(`\\b${name}\\b`, 'i').test(failureText));
      assert(matched.length > 0, `${file}: failing or inconclusive pilots must include a failure classification`);
    }

    assert(
      /does not certify mainnet use|NOT CERTIFIED FOR MAINNET/i.test(markdown),
      `${file}: must preserve the mainnet safety warning`,
    );
  }

  if (!errors.length) console.log(`Pilot result check passed: ${files.length} result file(s).`);
}

if (errors.length) {
  console.error('Pilot result check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
