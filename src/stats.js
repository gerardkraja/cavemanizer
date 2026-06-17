import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const MANIFEST_FILE = '.cavemanizer-manifest.json';
const STATS_FILE = 'stats.jsonl';

export async function recordSyncStats({ home, result, now = new Date() }) {
  if (!home || !result?.ok) return;
  const file = statsPath(home, result.agent);
  const event = {
    type: 'sync',
    agent: result.agent,
    at: now.toISOString(),
    outDir: result.outDir,
    provider: result.manifest?.provider ?? null,
    budget: result.manifest?.budget ?? null,
    summary: result.summary
  };
  await mkdir(path.dirname(file), { recursive: true });
  await appendFile(file, `${JSON.stringify(event)}\n`);
}

export async function readCavemanizerStats({ agent = 'claude', home = process.env.HOME, outDir } = {}) {
  if (!home) throw new Error('home is required');
  const generatedRoot = path.resolve(outDir ?? path.join(home, '.cavemanizer', agent, 'skills'));
  const manifestPath = path.join(generatedRoot, MANIFEST_FILE);
  const historyPath = statsPath(home, agent);
  const manifest = await readJson(manifestPath).catch(() => null);
  const events = await readJsonLines(historyPath);

  return {
    agent,
    manifestPath,
    historyPath,
    current: summarizeManifest(manifest),
    history: summarizeHistory(events)
  };
}

function statsPath(home, agent) {
  return path.join(home, '.cavemanizer', agent, STATS_FILE);
}

function summarizeManifest(manifest) {
  const entries = Object.values(manifest?.entries ?? {});
  const current = {
    skills: entries.length,
    creatorCompactSkills: 0,
    sourceEstimatedTokens: 0,
    cavemanEstimatedTokens: 0,
    estimatedTokensSaved: 0,
    sourceBytes: 0,
    cavemanBytes: 0,
    byteSavings: 0,
    generatedAt: manifest?.generatedAt ?? null
  };

  for (const entry of entries) {
    if (entry.cavemanizer === 'compact') current.creatorCompactSkills += 1;
    current.sourceEstimatedTokens += entry.counts?.source?.estimatedTokens ?? 0;
    current.cavemanEstimatedTokens += entry.counts?.caveman?.estimatedTokens ?? 0;
    current.sourceBytes += entry.counts?.source?.bytes ?? 0;
    current.cavemanBytes += entry.counts?.caveman?.bytes ?? 0;
  }

  current.estimatedTokensSaved = current.sourceEstimatedTokens - current.cavemanEstimatedTokens;
  current.byteSavings = current.sourceBytes
    ? Number((((current.sourceBytes - current.cavemanBytes) / current.sourceBytes) * 100).toFixed(1))
    : 0;
  return current;
}

function summarizeHistory(events) {
  const syncEvents = events.filter((event) => event.type === 'sync');
  const history = {
    successfulSyncs: syncEvents.length,
    firstSyncAt: syncEvents[0]?.at ?? null,
    lastSyncAt: syncEvents.at(-1)?.at ?? null,
    coveredMs: 0,
    generated: 0,
    adopted: 0,
    updated: 0,
    skipped: 0,
    removed: 0,
    cumulativeEstimatedTokensSaved: 0
  };

  for (const event of syncEvents) {
    history.generated += event.summary?.generated ?? 0;
    history.adopted += event.summary?.adopted ?? 0;
    history.updated += event.summary?.updated ?? 0;
    history.skipped += event.summary?.skipped ?? 0;
    history.removed += event.summary?.removed ?? 0;
    history.cumulativeEstimatedTokensSaved += event.summary?.estimatedTokensSaved ?? 0;
  }

  if (history.firstSyncAt && history.lastSyncAt) {
    history.coveredMs = Math.max(0, new Date(history.lastSyncAt) - new Date(history.firstSyncAt));
  }
  return history;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function readJsonLines(file) {
  let source = '';
  try {
    source = await readFile(file, 'utf8');
  } catch {
    return [];
  }
  return source
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
