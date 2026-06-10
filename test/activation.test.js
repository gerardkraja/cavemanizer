import assert from 'node:assert/strict';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { test } from 'node:test';

import { activateCavemanizedSkills, restoreActivatedSkills } from '../src/activation.js';
import { syncCavemanizedSkills } from '../src/sync.js';

const ORIGINAL_SKILL = `---
name: alpha
description: Use when alpha needs compact instructions.
---

# Alpha

Use when alpha work starts. You MUST run npm test -- --runInBand before
reporting. First, inspect the repository. Second, compress the skill. Third,
validate protected content. Fourth, report the exact verification. This prose is
intentionally verbose enough to compact.
`;

async function writeClaudeSkill(home, id, body) {
  const dir = path.join(home, '.claude', 'skills', id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, 'SKILL.md'), body);
  return path.join(dir, 'SKILL.md');
}

test('activateCavemanizedSkills replaces source skill with generated compact skill and restore puts original back', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-activate-'));
  const home = path.join(root, 'home');
  const sourcePath = await writeClaudeSkill(home, 'alpha', ORIGINAL_SKILL);
  await syncCavemanizedSkills({ agent: 'claude', home, providerName: 'fixture', budget: 120 });

  const activated = await activateCavemanizedSkills({ agent: 'claude', home });

  assert.equal(activated.ok, true);
  assert.deepEqual(activated.operations.map((op) => [op.action, op.skill]), [['activate', 'alpha']]);

  const activeSkill = await readFile(sourcePath, 'utf8');
  assert.ok(activeSkill.includes('<!-- cavemanizer: active'));
  assert.notEqual(activeSkill, ORIGINAL_SKILL);

  const backupPath = activated.manifest.entries.alpha.backupPath;
  assert.equal(await readFile(backupPath, 'utf8'), ORIGINAL_SKILL);
  await stat(path.join(home, '.cavemanizer', 'claude', 'activation-manifest.json'));

  const restored = await restoreActivatedSkills({ agent: 'claude', home });
  assert.equal(restored.ok, true);
  assert.deepEqual(restored.operations.map((op) => [op.action, op.skill]), [['restore', 'alpha']]);
  assert.equal(await readFile(sourcePath, 'utf8'), ORIGINAL_SKILL);
});

test('syncCavemanizedSkills uses activation backup as source after activation', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-activate-sync-'));
  const home = path.join(root, 'home');
  await writeClaudeSkill(home, 'alpha', ORIGINAL_SKILL);

  await syncCavemanizedSkills({ agent: 'claude', home, providerName: 'fixture', budget: 120 });
  await activateCavemanizedSkills({ agent: 'claude', home });

  const resync = await syncCavemanizedSkills({ agent: 'claude', home, providerName: 'fixture', budget: 120 });

  assert.deepEqual(resync.operations.map((op) => [op.action, op.skill]), [['skip', 'alpha']]);
});
