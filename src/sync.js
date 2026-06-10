import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { compressDocument } from './compress.js';
import { readActivationManifest } from './activation.js';
import { countText } from './ir.js';
import { isActivatedSkill, isCreatorCompact } from './markers.js';
import { discoverRealSkills } from './realSkills.js';

const MANIFEST_FILE = '.cavemanizer-manifest.json';

export async function syncCavemanizedSkills(options = {}) {
  const {
    agent = 'claude',
    home = process.env.HOME,
    providerName = 'fixture',
    providerOptions = {},
    budget = null,
    check = false,
    dryRun = false,
    clean = true
  } = options;
  if (!home) throw new Error('home is required');

  const outDir = path.resolve(options.outDir ?? path.join(home, '.cavemanizer', agent, 'skills'));
  const manifestPath = path.join(outDir, MANIFEST_FILE);
  const previousManifest = await readManifest(manifestPath);
  const activationManifest = await readActivationManifest(home, agent);
  const skills = await discoverRealSkills({ home, agent });
  const currentIds = new Set(skills.map((skill) => skill.id));
  const operations = [];
  const failures = [];
  const entries = {};
  const summary = createSummary();

  for (const skill of skills) {
    const sourceInfo = await readSourceForSync(skill, activationManifest);
    const source = sourceInfo.source;
    const sourceDigest = sha256(source);
    const outputDir = path.join(outDir, skill.id);
    const outputPath = path.join(outputDir, 'SKILL.md');
    const irPath = path.join(outputDir, 'ir.json');
    const reportPath = path.join(outputDir, 'report.json');
    const previousEntry = previousManifest.entries?.[skill.id];
    const generatedFilesExist = await filesExist([outputPath, irPath, reportPath]);
    const entry = manifestEntry({
      agent,
      skill,
      sourceDigest,
      outputPath,
      irPath,
      reportPath,
      providerName,
      budget
    });

    if (isCreatorCompact(source)) {
      const expected = expectedCompactSource(source, `${skill.id}/SKILL.md`);
      const action = previousEntry && generatedFilesExist ? 'skip' : 'adopt';
      if (check) {
        await checkGeneratedFiles({ expected, outputPath, irPath, reportPath, failures });
        operations.push({ action: 'check', agent, skill: skill.id, source: sourceInfo.sourcePath, target: outputPath });
        recordAction(summary, 'check');
      } else {
        operations.push({ action, agent, skill: skill.id, source: sourceInfo.sourcePath, target: outputPath });
        recordAction(summary, action);
        if (!dryRun && action !== 'skip') {
          await mkdir(outputDir, { recursive: true });
          await writeFile(outputPath, expected.skill);
          await writeFile(irPath, expected.ir);
          await writeFile(reportPath, expected.report);
        }
      }
      addCounts(summary, expected.counts);
      entries[skill.id] = {
        ...entry,
        cavemanizer: 'compact',
        counts: expected.counts,
        savings: { caveman: 0 },
        sourcePath: skill.path,
        sourceReadPath: sourceInfo.sourcePath
      };
      continue;
    }

    if (!check && previousEntry?.sourceDigest === sourceDigest && generatedFilesExist) {
      operations.push({ action: 'skip', agent, skill: skill.id, source: sourceInfo.sourcePath, target: outputPath });
      recordAction(summary, 'skip');
      addCounts(summary, previousEntry.counts);
      entries[skill.id] = { ...previousEntry, checkedAt: entry.checkedAt };
      continue;
    }

    const result = await compressDocument(source, {
      sourceName: `${skill.id}/SKILL.md`,
      providerName,
      providerOptions,
      budget
    });
    const expected = expectedOutputs(result);

    if (check) {
      await checkGeneratedFiles({ expected, outputPath, irPath, reportPath, failures });
      operations.push({ action: 'check', agent, skill: skill.id, source: sourceInfo.sourcePath, target: outputPath });
      recordAction(summary, 'check');
      addCounts(summary, result.report.counts);
      entries[skill.id] = previousEntry ?? withCompressionReport(entry, result.report);
      continue;
    }

    const action = previousEntry ? 'update' : 'generate';
    operations.push({ action, agent, skill: skill.id, source: sourceInfo.sourcePath, target: outputPath });
    recordAction(summary, action);
    addCounts(summary, result.report.counts);
    entries[skill.id] = withCompressionReport(entry, result.report);

    if (dryRun) continue;
    await mkdir(outputDir, { recursive: true });
    await writeFile(outputPath, expected.skill);
    await writeFile(irPath, expected.ir);
    await writeFile(reportPath, expected.report);
  }

  if (clean) {
    for (const [skillId, entry] of Object.entries(previousManifest.entries ?? {})) {
      if (currentIds.has(skillId)) continue;
      const outputDir = path.dirname(entry.outputPath ?? path.join(outDir, skillId, 'SKILL.md'));
      const operation = { action: check ? 'obsolete' : 'remove', agent, skill: skillId, target: outputDir };
      operations.push(operation);
      recordAction(summary, operation.action);
      if (check) {
        if (await exists(outputDir)) failures.push(`obsolete generated skill: ${outputDir}`);
      } else if (!dryRun) {
        await removeInside(outDir, outputDir);
      }
    }
  }

  const manifest = {
    version: 1,
    agent,
    outDir,
    provider: providerName,
    budget,
    generatedAt: new Date().toISOString(),
    entries
  };

  if (!check && !dryRun) {
    await mkdir(outDir, { recursive: true });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }

  return {
    ok: failures.length === 0,
    agent,
    outDir,
    manifestPath,
    operations,
    failures,
    summary: finalizeSummary(summary),
    manifest
  };
}

function expectedOutputs(result) {
  return {
    skill: result.outputs.caveman,
    ir: `${JSON.stringify(result.ir, null, 2)}\n`,
    report: `${JSON.stringify(result.report, null, 2)}\n`
  };
}

function expectedCompactSource(source, sourceName) {
  const counts = {
    source: countText(source),
    caveman: countText(source)
  };
  return {
    skill: source,
    ir: `${JSON.stringify({ sourceName, cavemanizer: 'compact' }, null, 2)}\n`,
    report: `${JSON.stringify({ sourceName, provider: 'creator', modes: ['caveman'], counts, savings: { caveman: 0 }, validation: { caveman: { warnings: [] } } }, null, 2)}\n`,
    counts
  };
}

async function checkGeneratedFiles({ expected, outputPath, irPath, reportPath, failures }) {
  const checks = [
    ['generated skill', outputPath, expected.skill],
    ['generated IR', irPath, expected.ir],
    ['generated report', reportPath, expected.report]
  ];

  for (const [label, file, expectedContent] of checks) {
    let actual = '';
    try {
      actual = await readFile(file, 'utf8');
    } catch {
      failures.push(`missing ${label}: ${file}`);
      continue;
    }
    if (actual !== expectedContent) failures.push(`stale ${label}: ${file}`);
  }
}

function manifestEntry({ agent, skill, sourceDigest, outputPath, irPath, reportPath, providerName, budget }) {
  const now = new Date().toISOString();
  return {
    agent,
    id: skill.id,
    sourcePath: skill.path,
    sourceDigest,
    outputPath,
    irPath,
    reportPath,
    provider: providerName,
    budget,
    updatedAt: now,
    checkedAt: now
  };
}

function withCompressionReport(entry, report) {
  return {
    ...entry,
    counts: report.counts,
    savings: report.savings,
    validation: report.validation
  };
}

function createSummary() {
  return {
    skills: 0,
    generated: 0,
    adopted: 0,
    updated: 0,
    skipped: 0,
    checked: 0,
    removed: 0,
    obsolete: 0,
    sourceBytes: 0,
    cavemanBytes: 0,
    sourceEstimatedTokens: 0,
    cavemanEstimatedTokens: 0,
    estimatedTokensSaved: 0,
    byteSavings: 0
  };
}

function recordAction(summary, action) {
  if (action === 'adopt') summary.adopted += 1;
  if (action === 'generate') summary.generated += 1;
  if (action === 'update') summary.updated += 1;
  if (action === 'skip') summary.skipped += 1;
  if (action === 'check') summary.checked += 1;
  if (action === 'remove') summary.removed += 1;
  if (action === 'obsolete') summary.obsolete += 1;
}

function addCounts(summary, counts) {
  if (!counts?.source || !counts?.caveman) return;
  summary.skills += 1;
  summary.sourceBytes += counts.source.bytes;
  summary.cavemanBytes += counts.caveman.bytes;
  summary.sourceEstimatedTokens += counts.source.estimatedTokens;
  summary.cavemanEstimatedTokens += counts.caveman.estimatedTokens;
}

function finalizeSummary(summary) {
  const estimatedTokensSaved = summary.sourceEstimatedTokens - summary.cavemanEstimatedTokens;
  const byteSavings = summary.sourceBytes
    ? Number((((summary.sourceBytes - summary.cavemanBytes) / summary.sourceBytes) * 100).toFixed(1))
    : 0;
  return {
    ...summary,
    estimatedTokensSaved,
    byteSavings
  };
}

async function readManifest(manifestPath) {
  try {
    return JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    return { version: 1, entries: {} };
  }
}

async function readSourceForSync(skill, activationManifest) {
  const source = await readFile(skill.path, 'utf8');
  const activationEntry = activationManifest.entries?.[skill.id];
  if (!activationEntry || !isActivatedSkill(source)) {
    return { source, sourcePath: skill.path };
  }
  try {
    return {
      source: await readFile(activationEntry.backupPath, 'utf8'),
      sourcePath: activationEntry.backupPath,
      activePath: skill.path
    };
  } catch {
    return { source, sourcePath: skill.path };
  }
}

async function filesExist(files) {
  const checks = await Promise.all(files.map((file) => stat(file).then((value) => value.isFile()).catch(() => false)));
  return checks.every(Boolean);
}

async function exists(file) {
  return stat(file).then(() => true).catch(() => false);
}

async function removeInside(root, target) {
  const resolvedRoot = path.resolve(root);
  const resolvedTarget = path.resolve(target);
  if (!resolvedTarget.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error(`Refusing to remove path outside generated root: ${target}`);
  }
  await rm(resolvedTarget, { recursive: true, force: true });
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}
