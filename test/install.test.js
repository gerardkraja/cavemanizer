import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { installSkills, planInstall } from '../src/install.js';

async function createSkillRoot(root) {
  const skillRoot = path.join(root, 'skills');
  await mkdir(path.join(skillRoot, 'cavemanizer'), { recursive: true });
  await writeFile(path.join(skillRoot, 'cavemanizer', 'SKILL.md'), '# Cavemanizer\n');
  return skillRoot;
}

test('planInstall reports target files without writing them', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-install-plan-'));
  const home = path.join(root, 'home');
  const skillRoot = await createSkillRoot(root);

  const plan = await planInstall({
    agents: ['codex', 'generic'],
    home,
    skillRoot
  });

  assert.ok(plan.operations.some((op) => op.target.endsWith('.codex/skills/cavemanizer/SKILL.md')));
  assert.equal(plan.operations.length, 2);
  assert.ok(plan.operations.every((op) => op.skill === 'cavemanizer'));
});

test('installSkills copies skills into selected agent directories', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-install-'));
  const home = path.join(root, 'home');
  const skillRoot = await createSkillRoot(root);

  const result = await installSkills({
    agents: ['codex'],
    home,
    skillRoot
  });

  assert.equal(result.operations.length, 1);
  const installed = await readFile(path.join(home, '.codex', 'skills', 'cavemanizer', 'SKILL.md'), 'utf8');
  assert.equal(installed, '# Cavemanizer\n');
});
