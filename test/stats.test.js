import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { readCavemanizerStats } from '../src/stats.js';
import { syncCavemanizedSkills } from '../src/sync.js';

async function writeSkill(home, agent, id, body) {
  const dir = path.join(home, `.${agent}`, 'skills', id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), body);
}

const VERBOSE_SKILL = `---
name: alpha
description: Use when alpha needs compact instructions.
---

# Alpha

Use when alpha work starts. You MUST run \`npm test\` before reporting.
First, inspect the local skill root. Second, compress only the skill files.
Third, validate protected content. Fourth, report the exact commands that were
run. This explanation is intentionally verbose so stats have a meaningful
compression delta and history can show estimated savings.
`;

test('sync records stats and stats reader summarizes current savings', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-stats-'));
  const home = path.join(root, 'home');
  const outDir = path.join(root, 'generated');
  await writeSkill(home, 'claude', 'alpha', VERBOSE_SKILL);

  const first = await syncCavemanizedSkills({
    agent: 'claude',
    home,
    outDir,
    providerName: 'fixture',
    budget: 120
  });
  assert.equal(first.ok, true);

  const stats = await readCavemanizerStats({ agent: 'claude', home, outDir });

  assert.equal(stats.current.skills, 1);
  assert.ok(stats.current.sourceEstimatedTokens > stats.current.cavemanEstimatedTokens);
  assert.ok(stats.current.estimatedTokensSaved > 0);
  assert.equal(stats.history.successfulSyncs, 1);
  assert.equal(stats.history.generated, 1);
  assert.equal(stats.history.cumulativeEstimatedTokensSaved, first.summary.estimatedTokensSaved);

  const history = await readFile(path.join(home, '.cavemanizer', 'claude', 'stats.jsonl'), 'utf8');
  assert.equal(history.trim().split('\n').length, 1);
  assert.match(history, /"type":"sync"/);
});

test('stats reader aggregates history across multiple syncs', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-stats-history-'));
  const home = path.join(root, 'home');
  const outDir = path.join(root, 'generated');
  await writeSkill(home, 'claude', 'alpha', VERBOSE_SKILL);

  const first = await syncCavemanizedSkills({ agent: 'claude', home, outDir, providerName: 'fixture', budget: 120 });
  const second = await syncCavemanizedSkills({ agent: 'claude', home, outDir, providerName: 'fixture', budget: 120 });
  const stats = await readCavemanizerStats({ agent: 'claude', home, outDir });

  assert.equal(stats.history.successfulSyncs, 2);
  assert.equal(stats.history.generated, 1);
  assert.equal(stats.history.skipped, 1);
  assert.equal(
    stats.history.cumulativeEstimatedTokensSaved,
    first.summary.estimatedTokensSaved + second.summary.estimatedTokensSaved
  );
  assert.ok(stats.history.firstSyncAt);
  assert.ok(stats.history.lastSyncAt);
});
