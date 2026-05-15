#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readmePath = path.join(root, 'docs/pilots/README.md');

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

function clean(cell) {
  return cell.replace(/`/g, '').trim();
}

if (!fs.existsSync(readmePath)) {
  console.error('Missing docs/pilots/README.md');
  process.exit(1);
}

const readme = fs.readFileSync(readmePath, 'utf8');
const matrix = new Map();
for (const [pilot, primaryRail, purpose, runbookCell] of tableRows(readme, 'Pilot Matrix')) {
  const link = markdownLink(runbookCell ?? '');
  matrix.set(pilot.toLowerCase(), {
    pilot,
    primaryRail,
    purpose,
    runbook: link?.href?.replace(/^\.\//, 'docs/pilots/') ?? '',
  });
}

const completed = tableRows(readme, 'Completed Results').map(([pilot, result, recordCell]) => ({
  pilot,
  result: clean(result),
  record: markdownLink(recordCell ?? '')?.href?.replace(/^\.\//, 'docs/pilots/') ?? '',
}));

const pending = tableRows(readme, 'Pending Pilots').map(([pilot, blockingEvidence]) => ({
  ...(matrix.get(pilot.toLowerCase()) ?? { pilot, primaryRail: '', purpose: '', runbook: '' }),
  blockingEvidence,
}));

console.log(`P4 pilot status: ${completed.length}/${matrix.size} complete, ${pending.length} pending.`);

if (completed.length) {
  console.log('\nCompleted:');
  for (const item of completed) {
    console.log(`- ${item.pilot}: ${item.result} (${item.record})`);
  }
}

if (pending.length) {
  console.log('\nPending external evidence:');
  for (const item of pending) {
    console.log(`- ${item.pilot}`);
    console.log(`  rail: ${item.primaryRail}`);
    console.log(`  runbook: ${item.runbook}`);
    console.log(`  blocking evidence: ${item.blockingEvidence}`);
  }
}

console.log('\nRun npm run pilots:check before committing any completed pilot result.');
