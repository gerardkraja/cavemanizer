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
