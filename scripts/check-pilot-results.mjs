#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readmePath = path.join(root, 'docs/pilots/README.md');
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

function tableRows(markdown, heading) {
  return section(markdown, heading)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
    .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
    .filter((cells) => {
      if (!cells.length) return false;
      if (cells[0] === 'Pilot') return false;
      if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) return false;
      return true;
    });
}

function markdownLink(cell) {
  const match = cell.match(/\[([^\]]+)\]\(([^)]+)\)/);
  if (!match) return null;
  return { label: match[1], href: match[2].split('#')[0] };
}

function pilotKey(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function docsPilotTarget(href) {
  return path.posix.normalize(path.posix.join('docs/pilots', href.replace(/^\.\//, '')));
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

let readme = '';
const pilotMatrix = new Map();
const completedRowsByFile = new Map();
const pendingRowsByPilot = new Map();
const resultRowsByPilot = new Map();

if (!fs.existsSync(readmePath)) {
  errors.push('docs/pilots/README.md must exist');
} else {
  readme = fs.readFileSync(readmePath, 'utf8');

  const matrixRows = tableRows(readme, 'Pilot Matrix');
  assert(matrixRows.length > 0, 'docs/pilots/README.md must include a Pilot Matrix table');

  for (const cells of matrixRows) {
    const [pilot, primaryRail, purpose, runbookCell] = cells;
    assert(Boolean(pilot), 'Pilot Matrix rows must include a pilot name');
    assert(Boolean(primaryRail), `Pilot Matrix row for ${pilot} must include a primary rail`);
    assert(Boolean(purpose), `Pilot Matrix row for ${pilot} must include a purpose`);

    const key = pilotKey(pilot ?? '');
    assert(!pilotMatrix.has(key), `Pilot Matrix has a duplicate pilot: ${pilot}`);

    const link = markdownLink(runbookCell ?? '');
    assert(Boolean(link), `Pilot Matrix row for ${pilot} must link a runbook`);
    const target = link ? docsPilotTarget(link.href) : '';
    assert(target.endsWith('.md'), `Pilot Matrix row for ${pilot} must link a markdown runbook`);
    assert(target.startsWith('docs/pilots/'), `Pilot Matrix row for ${pilot} must stay inside docs/pilots`);
    assert(target !== 'docs/pilots/README.md' && target !== 'docs/pilots/result-template.md', `Pilot Matrix row for ${pilot} must link a concrete runbook`);
    assert(fs.existsSync(path.join(root, target)), `${target} must exist for pilot ${pilot}`);

    if (target && fs.existsSync(path.join(root, target))) {
      const runbook = fs.readFileSync(path.join(root, target), 'utf8');
      for (const heading of [
        'Goal',
        'Scenario',
        'Preflight',
        'Expected Receipts',
        'Evidence To Capture',
        'Rollback Plan',
        'Pass Criteria',
      ]) {
        requireHeading(runbook, target, heading);
      }
      assert(/mainnet/i.test(runbook), `${target} must preserve mainnet safety context`);
    }

    pilotMatrix.set(key, { pilot, primaryRail, purpose, target });
  }

  const completedRows = tableRows(readme, 'Completed Results');
  assert(completedRows.length > 0, 'docs/pilots/README.md must include at least one completed result row');

  for (const cells of completedRows) {
    const [pilot, resultCell, recordCell] = cells;
    const result = stripTicks(resultCell ?? '').toLowerCase();
    const key = pilotKey(pilot ?? '');
    const link = markdownLink(recordCell ?? '');
    const target = link ? docsPilotTarget(link.href) : '';
    const fileName = target ? path.basename(target) : '';

    assert(pilotMatrix.has(key), `Completed Results row must reference a Pilot Matrix entry: ${pilot}`);
    assert(allowedResults.has(result), `Completed Results row for ${pilot} must use pass, fail, or inconclusive`);
    assert(Boolean(link), `Completed Results row for ${pilot} must link a result record`);
    assert(target.startsWith('docs/pilots/results/'), `Completed Results row for ${pilot} must link docs/pilots/results/*.md`);
    assert(fs.existsSync(path.join(root, target)), `${target} must exist for completed pilot ${pilot}`);
    assert(!completedRowsByFile.has(fileName), `Completed Results has a duplicate record: ${fileName}`);

    completedRowsByFile.set(fileName, { pilot, result, target });
  }

  const pendingRows = tableRows(readme, 'Pending Pilots');
  for (const cells of pendingRows) {
    const [pilot, blockingEvidence] = cells;
    const key = pilotKey(pilot ?? '');
    assert(pilotMatrix.has(key), `Pending Pilots row must reference a Pilot Matrix entry: ${pilot}`);
    assert(Boolean(blockingEvidence), `Pending Pilots row for ${pilot} must describe blocking evidence`);
    assert(!pendingRowsByPilot.has(key), `Pending Pilots has a duplicate pilot: ${pilot}`);
    pendingRowsByPilot.set(key, { pilot, blockingEvidence });
  }
}

if (!fs.existsSync(resultsDir)) {
  errors.push('docs/pilots/results must exist');
} else {
  const files = fs
    .readdirSync(resultsDir)
    .filter((name) => name.endsWith('.md'))
    .sort();

  assert(files.length > 0, 'docs/pilots/results must contain at least one pilot result');

  for (const fileName of files) {
    const abs = path.join(resultsDir, fileName);
    const file = rel(abs);
    const markdown = fs.readFileSync(abs, 'utf8');
    const dateFromName = fileName.match(/^(\d{4}-\d{2}-\d{2})-[a-z0-9-]+\.md$/)?.[1];

    assert(Boolean(dateFromName), `${file} must use YYYY-MM-DD-slug.md naming`);
    assert(completedRowsByFile.has(fileName), `docs/pilots/README.md Completed Results must link ${file}`);

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

    const pilot = stripTicks(summary.get('Pilot') ?? '');
    const key = pilotKey(pilot);
    assert(pilotMatrix.has(key), `${file}: Pilot must match a Pilot Matrix entry`);

    const date = stripTicks(summary.get('Date') ?? '');
    if (dateFromName) assert(date === dateFromName, `${file}: Date must match filename date ${dateFromName}`);

    const commit = stripTicks(summary.get('Git commit') ?? '');
    assert(/^[0-9a-f]{7,40}$/i.test(commit), `${file}: Git commit must be a 7-40 character hex commit`);

    const result = stripTicks(summary.get('Result') ?? '').toLowerCase();
    assert(allowedResults.has(result), `${file}: Result must be pass, fail, or inconclusive`);
    resultRowsByPilot.set(key, { pilot, result, fileName });

    const completedRow = completedRowsByFile.get(fileName);
    if (completedRow) {
      assert(pilotKey(completedRow.pilot) === key, `${file}: Completed Results pilot must match result summary`);
      assert(completedRow.result === result, `${file}: Completed Results status must match result summary`);
    }

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

  for (const [fileName, row] of completedRowsByFile) {
    assert(files.includes(fileName), `docs/pilots/README.md Completed Results links a missing result: ${row.target}`);
  }

  const pendingPilotKeys = [...pilotMatrix.keys()].filter((key) => !resultRowsByPilot.has(key));
  for (const key of pendingPilotKeys) {
    assert(pendingRowsByPilot.has(key), `docs/pilots/README.md Pending Pilots must list ${pilotMatrix.get(key)?.pilot}`);
  }
  for (const [key, row] of pendingRowsByPilot) {
    assert(!resultRowsByPilot.has(key), `docs/pilots/README.md must move ${row.pilot} from Pending Pilots to Completed Results`);
  }

  if (!errors.length) {
    console.log(
      `Pilot result check passed: ${files.length} result file(s); P4 progress ${resultRowsByPilot.size}/${pilotMatrix.size} pilots complete (${pendingPilotKeys.length} pending).`,
    );
  }
}

if (errors.length) {
  console.error('Pilot result check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
