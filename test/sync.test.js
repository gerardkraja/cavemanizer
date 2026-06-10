import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { test } from 'node:test';

import { syncCavemanizedSkills } from '../src/sync.js';

async function writeSkill(home, agent, id, body) {
  const dir = path.join(home, `.${agent}`, 'skills', id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), body);
  return dir;
}

const ALPHA_SKILL = `---
name: alpha
description: Use when alpha needs compact instructions.
---

# Alpha

Use when alpha work starts. You MUST run \`npm test\` before reporting.
It is important to inspect the repository carefully because generated files and
human edits may both be present. First, inspect the local skill root. Second,
compress only the skill files. Third, validate protected content. Fourth, report
the exact commands that were run. This explanation is intentionally verbose so
the sync summary has a meaningful compression delta.
`;

const BETA_SKILL = `---
name: beta
description: Use when beta needs compact instructions.
---

# Beta

Use when beta work starts. You MUST preserve https://example.com/beta.
First, read source context. Second, preserve exact URLs and commands. Third,
write the generated skill. Fourth, verify the generated output. The prose here
is intentionally longer than the compact output.
`;

const CREATOR_COMPACT_SKILL = `---
name: creator-compact
description: Already compact by the skill creator.
cavemanizer: compact
---

# Creator Compact

Use: already dense.
Rules:
- MUST keep \`npm test\`.
Flow: read -> act -> verify.
`;

test('syncCavemanizedSkills generates shadow skills and manifest entries', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-sync-'));
  const home = path.join(root, 'home');
  const outDir = path.join(root, 'generated');
  await writeSkill(home, 'claude', 'alpha', ALPHA_SKILL);

  const result = await syncCavemanizedSkills({
    agent: 'claude',
    home,
    outDir,
    providerName: 'fixture',
    budget: 120
  });

  assert.equal(result.ok, true);
  assert.equal(result.summary.generated, 1);
  assert.ok(result.summary.sourceEstimatedTokens > result.summary.cavemanEstimatedTokens);
  assert.ok(result.summary.estimatedTokensSaved > 0);
  assert.deepEqual(result.operations.map((op) => [op.action, op.skill]), [['generate', 'alpha']]);

  const generatedSkill = await readFile(path.join(outDir, 'alpha', 'SKILL.md'), 'utf8');
  assert.ok(generatedSkill.startsWith('---\nname: alpha'));
  assert.ok(generatedSkill.includes('npm test'));

  const manifest = JSON.parse(await readFile(path.join(outDir, '.cavemanizer-manifest.json'), 'utf8'));
  assert.equal(manifest.agent, 'claude');
  assert.equal(manifest.entries.alpha.sourceDigest.length, 64);
  assert.equal(manifest.entries.alpha.counts.source.estimatedTokens, result.summary.sourceEstimatedTokens);
  assert.equal(manifest.entries.alpha.outputPath, path.join(outDir, 'alpha', 'SKILL.md'));
});

test('syncCavemanizedSkills skips unchanged skills and removes deleted source skills', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-sync-remove-'));
  const home = path.join(root, 'home');
  const outDir = path.join(root, 'generated');
  await writeSkill(home, 'claude', 'alpha', ALPHA_SKILL);
  const betaDir = await writeSkill(home, 'claude', 'beta', BETA_SKILL);

  await syncCavemanizedSkills({ agent: 'claude', home, outDir, providerName: 'fixture', budget: 120 });
  const second = await syncCavemanizedSkills({ agent: 'claude', home, outDir, providerName: 'fixture', budget: 120 });
  assert.equal(second.summary.skipped, 2);
  assert.ok(second.summary.estimatedTokensSaved > 0);
  assert.deepEqual(
    second.operations.map((op) => [op.action, op.skill]).sort(),
    [
      ['skip', 'alpha'],
      ['skip', 'beta']
    ]
  );

  await rm(betaDir, { recursive: true, force: true });
  const third = await syncCavemanizedSkills({ agent: 'claude', home, outDir, providerName: 'fixture', budget: 120 });

  assert.ok(third.operations.some((op) => op.action === 'remove' && op.skill === 'beta'));
  await assert.rejects(stat(path.join(outDir, 'beta')));
  const manifest = JSON.parse(await readFile(path.join(outDir, '.cavemanizer-manifest.json'), 'utf8'));
  assert.deepEqual(Object.keys(manifest.entries), ['alpha']);
});

test('syncCavemanizedSkills check mode reports stale generated skills without writing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-sync-check-'));
  const home = path.join(root, 'home');
  const outDir = path.join(root, 'generated');
  await writeSkill(home, 'claude', 'alpha', ALPHA_SKILL);

  await syncCavemanizedSkills({ agent: 'claude', home, outDir, providerName: 'fixture', budget: 120 });
  await writeFile(path.join(outDir, 'alpha', 'SKILL.md'), 'stale\n');

  const result = await syncCavemanizedSkills({
    agent: 'claude',
    home,
    outDir,
    providerName: 'fixture',
    budget: 120,
    check: true
  });

  assert.equal(result.ok, false);
  assert.ok(result.failures.some((failure) => failure.includes('stale generated skill')));
  assert.equal(await readFile(path.join(outDir, 'alpha', 'SKILL.md'), 'utf8'), 'stale\n');
});

test('syncCavemanizedSkills adopts creator-marked compact skills without recompressing', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-sync-compact-'));
  const home = path.join(root, 'home');
  const outDir = path.join(root, 'generated');
  await writeSkill(home, 'claude', 'creator-compact', CREATOR_COMPACT_SKILL);

  const result = await syncCavemanizedSkills({
    agent: 'claude',
    home,
    outDir,
    providerName: 'fixture',
    budget: 120
  });

  assert.deepEqual(result.operations.map((op) => [op.action, op.skill]), [['adopt', 'creator-compact']]);
  assert.equal(await readFile(path.join(outDir, 'creator-compact', 'SKILL.md'), 'utf8'), CREATOR_COMPACT_SKILL);
  assert.equal(result.summary.estimatedTokensSaved, 0);

  const manifest = JSON.parse(await readFile(path.join(outDir, '.cavemanizer-manifest.json'), 'utf8'));
  assert.equal(manifest.entries['creator-compact'].cavemanizer, 'compact');
});
