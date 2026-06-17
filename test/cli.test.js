import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const CLI = path.resolve('bin/cavemanizer.js');

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [CLI, ...args], {
    cwd: path.resolve('.'),
    encoding: 'utf8',
    ...options
  });
}

test('CLI compress writes outputs and check detects drift', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-cli-'));
  const inputDir = path.join(root, 'fixtures', 'sample');
  const outDir = path.join(root, 'generated');
  await mkdir(inputDir, { recursive: true });
  await writeFile(path.join(inputDir, 'SKILL.md'), `---
name: cli-sample
description: Fixture for CLI compression.
---

# CLI Sample

Use when the CLI needs to compress a skill. You MUST preserve \`npm test\` and
https://example.com/cli exactly. Follow the workflow: inspect, compress, verify.

\`\`\`bash
npm test
\`\`\`
`);

  const compress = runCli(['compress', path.join(root, 'fixtures'), '--out-dir', outDir, '--provider', 'fixture']);
  assert.equal(compress.status, 0, compress.stderr || compress.stdout);

  const checkClean = runCli(['check', path.join(root, 'fixtures'), '--out-dir', outDir, '--provider', 'fixture']);
  assert.equal(checkClean.status, 0, checkClean.stderr || checkClean.stdout);

  const cavemanPath = path.join(outDir, 'sample', 'cavemanized.md');
  const original = await readFile(cavemanPath, 'utf8');
  await writeFile(cavemanPath, `${original}\nmanual drift\n`);

  const checkDrift = runCli(['check', path.join(root, 'fixtures'), '--out-dir', outDir, '--provider', 'fixture']);
  assert.notEqual(checkDrift.status, 0);
  assert.match(`${checkDrift.stdout}\n${checkDrift.stderr}`, /stale generated output/);
});

test('CLI check rejects obsolete generated files', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-cli-extra-'));
  const inputDir = path.join(root, 'fixtures', 'sample');
  const outDir = path.join(root, 'generated');
  await mkdir(inputDir, { recursive: true });
  await writeFile(path.join(inputDir, 'SKILL.md'), `---
name: cli-extra
description: Fixture for stale output detection.
---

# CLI Extra

Use when the CLI needs to reject obsolete generated files. You MUST preserve
\`npm test\`.
`);

  const compress = runCli(['compress', path.join(root, 'fixtures'), '--out-dir', outDir, '--provider', 'fixture']);
  assert.equal(compress.status, 0, compress.stderr || compress.stdout);

  await writeFile(path.join(outDir, 'sample', 'minicavemanized.md'), 'obsolete\n');

  const check = runCli(['check', path.join(root, 'fixtures'), '--out-dir', outDir, '--provider', 'fixture']);
  assert.notEqual(check.status, 0);
  assert.match(`${check.stdout}\n${check.stderr}`, /obsolete generated output/);
});

test('CLI exposes a minimal command surface', () => {
  const help = runCli(['--help']);

  assert.equal(help.status, 0, help.stderr || help.stdout);
  assert.match(help.stdout, /sync/);
  assert.match(help.stdout, /mark-compact/);
  assert.doesNotMatch(help.stdout, /\bdiff\b/);
  assert.doesNotMatch(help.stdout, /\bpreprocess\b/);
  assert.doesNotMatch(help.stdout, /\blist-agents\b/);
  assert.doesNotMatch(help.stdout, /\bgeneric\b/);
  assert.doesNotMatch(help.stdout, /openrouter/);
});

test('CLI marks and unmarks compact skills', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-mark-'));
  const skillPath = path.join(root, 'SKILL.md');
  await writeFile(skillPath, `---
name: markable
description: A skill that can be marked compact.
---

# Markable
`);

  const mark = runCli(['mark-compact', skillPath]);
  assert.equal(mark.status, 0, mark.stderr || mark.stdout);
  assert.match(await readFile(skillPath, 'utf8'), /cavemanizer: compact/);

  const markAgain = runCli(['mark-compact', skillPath]);
  assert.equal(markAgain.status, 0, markAgain.stderr || markAgain.stdout);
  const marked = await readFile(skillPath, 'utf8');
  assert.equal((marked.match(/cavemanizer: compact/g) ?? []).length, 1);

  const unmark = runCli(['unmark-compact', skillPath]);
  assert.equal(unmark.status, 0, unmark.stderr || unmark.stdout);
  assert.doesNotMatch(await readFile(skillPath, 'utf8'), /cavemanizer: compact/);
});
