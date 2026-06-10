import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { discoverRealSkills } from '../src/realSkills.js';

test('discoverRealSkills lists local agent skills and marks Caveman candidates', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-real-skills-'));
  const home = path.join(root, 'home');
  const codexSkill = path.join(home, '.codex', 'skills', 'brainstorming');
  const claudeSkill = path.join(home, '.claude', 'skills', 'caveman');
  await mkdir(codexSkill, { recursive: true });
  await mkdir(claudeSkill, { recursive: true });
  await writeFile(path.join(codexSkill, 'SKILL.md'), '---\nname: brainstorming\n---\n# Brainstorming\n');
  await writeFile(path.join(claudeSkill, 'SKILL.md'), '---\nname: caveman\n---\n# Caveman\n');

  const skills = await discoverRealSkills({ home });

  assert.deepEqual(
    skills.map((skill) => [skill.agent, skill.id, skill.caveman]),
    [
      ['codex', 'brainstorming', false],
      ['claude', 'caveman', true]
    ]
  );
});
