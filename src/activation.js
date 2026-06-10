import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { isActivatedSkill, withActiveMarker } from './markers.js';

const SYNC_MANIFEST_FILE = '.cavemanizer-manifest.json';
const ACTIVATION_MANIFEST_FILE = 'activation-manifest.json';

export function activationManifestPath(home, agent) {
  return path.join(home, '.cavemanizer', agent, ACTIVATION_MANIFEST_FILE);
}

export async function readActivationManifest(home, agent) {
  try {
    return JSON.parse(await readFile(activationManifestPath(home, agent), 'utf8'));
  } catch {
    return { version: 1, agent, entries: {} };
  }
}

export async function activateCavemanizedSkills(options = {}) {
  const {
    agent = 'claude',
    home = process.env.HOME,
    outDir = path.join(home, '.cavemanizer', agent, 'skills'),
    dryRun = false
  } = options;
  if (!home) throw new Error('home is required');

  const syncManifest = await readSyncManifest(path.join(outDir, SYNC_MANIFEST_FILE));
  const previousActivation = await readActivationManifest(home, agent);
  const activationPath = activationManifestPath(home, agent);
  const entries = {};
  const operations = [];
  const failures = [];

  for (const [skillId, entry] of Object.entries(syncManifest.entries ?? {})) {
    const sourcePath = entry.sourcePath;
    const generatedPath = entry.outputPath;
    const backupPath = previousActivation.entries?.[skillId]?.backupPath
      ?? path.join(home, '.cavemanizer', agent, 'backups', skillId, 'SKILL.md');

    let generated = '';
    let current = '';
    try {
      generated = await readFile(generatedPath, 'utf8');
      current = await readFile(sourcePath, 'utf8');
    } catch (error) {
      failures.push(`cannot activate ${skillId}: ${error.message}`);
      continue;
    }

    const activated = withActiveMarker(generated, {
      backupPath,
      generatedPath,
      sourceDigest: entry.sourceDigest
    });
    const action = isActivatedSkill(current) ? 'refresh' : 'activate';
    operations.push({ action, agent, skill: skillId, source: generatedPath, target: sourcePath, backup: backupPath });

    entries[skillId] = {
      agent,
      id: skillId,
      sourcePath,
      generatedPath,
      backupPath,
      sourceDigest: entry.sourceDigest,
      activatedAt: new Date().toISOString()
    };

    if (dryRun) continue;
    if (!isActivatedSkill(current) && !(await exists(backupPath))) {
      await mkdir(path.dirname(backupPath), { recursive: true });
      await writeFile(backupPath, current);
    }
    await writeFile(sourcePath, activated);
  }

  const manifest = {
    version: 1,
    agent,
    generatedRoot: outDir,
    activatedAt: new Date().toISOString(),
    entries
  };

  if (!dryRun) {
    await mkdir(path.dirname(activationPath), { recursive: true });
    await writeFile(activationPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  return { ok: failures.length === 0, agent, manifestPath: activationPath, operations, failures, manifest };
}

export async function restoreActivatedSkills(options = {}) {
  const { agent = 'claude', home = process.env.HOME, dryRun = false } = options;
  if (!home) throw new Error('home is required');

  const activationPath = activationManifestPath(home, agent);
  const activation = await readActivationManifest(home, agent);
  const operations = [];
  const failures = [];

  for (const [skillId, entry] of Object.entries(activation.entries ?? {})) {
    try {
      const backup = await readFile(entry.backupPath, 'utf8');
      operations.push({ action: 'restore', agent, skill: skillId, source: entry.backupPath, target: entry.sourcePath });
      if (!dryRun) await writeFile(entry.sourcePath, backup);
    } catch (error) {
      failures.push(`cannot restore ${skillId}: ${error.message}`);
    }
  }

  if (!dryRun && failures.length === 0) {
    await rm(activationPath, { force: true });
  }

  return { ok: failures.length === 0, agent, manifestPath: activationPath, operations, failures };
}

async function readSyncManifest(manifestPath) {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    throw new Error(`No generated skill manifest found at ${manifestPath}. Run sync first.`);
  }
}

async function exists(file) {
  return stat(file).then(() => true).catch(() => false);
}
