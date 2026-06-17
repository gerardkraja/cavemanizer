import { cp, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';

const AGENTS = {
  codex: (home) => path.join(home, '.codex', 'skills'),
  claude: (home) => path.join(home, '.claude', 'skills')
};

export async function planInstall({ agents = ['codex'], home = process.env.HOME, skillRoot = path.resolve('skills') } = {}) {
  if (!home) throw new Error('home is required');
  const skillDirs = await findSkillDirs(skillRoot);
  const operations = [];

  for (const agent of agents) {
    const targetRootFactory = AGENTS[agent];
    if (!targetRootFactory) throw new Error(`Unsupported agent: ${agent}`);
    const targetRoot = targetRootFactory(home);
    for (const skill of skillDirs) {
      operations.push({
        action: 'copy',
        agent,
        skill: skill.name,
        source: skill.file,
        target: path.join(targetRoot, skill.name, 'SKILL.md')
      });
    }
  }

  return { operations };
}

export async function installSkills(options = {}) {
  const plan = await planInstall(options);
  for (const op of plan.operations) {
    await mkdir(path.dirname(op.target), { recursive: true });
    await cp(op.source, op.target);
  }
  return plan;
}

async function findSkillDirs(skillRoot) {
  const children = await readdir(skillRoot, { withFileTypes: true });
  const skills = [];
  for (const child of children) {
    if (!child.isDirectory()) continue;
    const file = path.join(skillRoot, child.name, 'SKILL.md');
    try {
      await import('node:fs/promises').then(({ stat }) => stat(file));
      skills.push({ name: child.name, file });
    } catch {
      // Ignore non-skill folders.
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return skills;
}
