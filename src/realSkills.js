import { readdir, stat } from 'node:fs/promises';
import path from 'node:path';

const SKILL_ROOTS = [
  ['codex', '.codex/skills'],
  ['claude', '.claude/skills']
];

export async function discoverRealSkills({ home = process.env.HOME, agent = null, agents = null } = {}) {
  if (!home) throw new Error('home is required');
  const selectedAgents = normalizeAgentFilter(agents ?? agent);
  const skills = [];

  for (const [agentName, relativeRoot] of SKILL_ROOTS) {
    if (selectedAgents && !selectedAgents.has(agentName)) continue;
    const root = path.join(home, relativeRoot);
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillPath = path.join(root, entry.name, 'SKILL.md');
      const exists = await stat(skillPath).then((value) => value.isFile()).catch(() => false);
      if (!exists) continue;
      skills.push({
        agent: agentName,
        id: entry.name,
        path: skillPath,
        caveman: isCavemanCandidate(entry.name)
      });
    }
  }

  return skills.sort((a, b) => {
    const agentOrder = agentRank(a.agent) - agentRank(b.agent);
    return agentOrder || a.id.localeCompare(b.id);
  });
}

function normalizeAgentFilter(value) {
  if (!value) return null;
  const values = Array.isArray(value) ? value : [value];
  return new Set(values);
}

function isCavemanCandidate(id) {
  return id.toLowerCase().includes('caveman');
}

function agentRank(agent) {
  return SKILL_ROOTS.findIndex(([candidate]) => candidate === agent);
}
