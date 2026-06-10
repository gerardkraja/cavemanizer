import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { countText, extractProtectedContent, normalizeIr, validateRenderedDocument } from './ir.js';
import { createProvider } from './providers.js';
import { renderCaveman } from './renderers.js';

export async function compressDocument(source, options = {}) {
  const {
    sourceName = 'SKILL.md',
    providerName = 'fixture',
    providerOptions = {},
    modes = ['caveman'],
    budget = null
  } = options;

  const protectedContent = extractProtectedContent(source);
  const provider = createProvider(providerName, providerOptions);
  const ir = normalizeIr(await provider.extractIr(source, { sourceName, budget }), { sourceName });
  const outputs = {};

  if (modes.includes('caveman')) outputs.caveman = renderCaveman(ir, protectedContent, { budget });

  const validation = Object.fromEntries(
    Object.entries(outputs).map(([mode, rendered]) => [mode, validateRenderedDocument(rendered, protectedContent)])
  );
  const counts = {
    source: countText(source),
    ...Object.fromEntries(Object.entries(outputs).map(([mode, rendered]) => [mode, countText(rendered)]))
  };

  return {
    sourceName,
    provider: provider.name,
    ir,
    outputs,
    report: {
      sourceName,
      provider: provider.name,
      modes: Object.keys(outputs),
      counts,
      savings: Object.fromEntries(
        Object.entries(outputs).map(([mode]) => [mode, savings(counts.source.bytes, counts[mode].bytes)])
      ),
      validation
    }
  };
}

export async function writeCompressionOutputs(result, outDir) {
  await mkdir(outDir, { recursive: true });
  const writes = [];
  if (result.outputs.caveman) {
    writes.push(writeFile(path.join(outDir, 'cavemanized.md'), result.outputs.caveman));
  }
  writes.push(writeFile(path.join(outDir, 'ir.json'), `${JSON.stringify(result.ir, null, 2)}\n`));
  writes.push(writeFile(path.join(outDir, 'report.json'), `${JSON.stringify(result.report, null, 2)}\n`));
  await Promise.all(writes);
}

export async function compressPath(inputPath, options = {}) {
  const entries = await findSkillFiles(inputPath);
  const inputStats = await statPath(inputPath);
  const results = [];
  for (const entry of entries) {
    const source = await readFile(entry.file, 'utf8');
    const sourceName = path.relative(inputPath, entry.file) || path.basename(entry.file);
    const result = await compressDocument(source, {
      ...options,
      sourceName
    });
    const outDir = inputStats.isFile() ? options.outDir : path.join(options.outDir, entry.name);
    await writeCompressionOutputs(result, outDir);
    results.push({ ...result, outDir });
  }
  return results;
}

export async function checkPath(inputPath, options = {}) {
  const entries = await findSkillFiles(inputPath);
  const inputStats = await statPath(inputPath);
  const failures = [];

  for (const entry of entries) {
    const source = await readFile(entry.file, 'utf8');
    const sourceName = path.relative(inputPath, entry.file) || path.basename(entry.file);
    const result = await compressDocument(source, {
      ...options,
      sourceName
    });
    const outDir = inputStats.isFile() ? options.outDir : path.join(options.outDir, entry.name);
    const expectedFiles = {
      caveman: result.outputs.caveman ? ['cavemanized.md', result.outputs.caveman] : null,
      ir: ['ir.json', `${JSON.stringify(result.ir, null, 2)}\n`],
      report: ['report.json', `${JSON.stringify(result.report, null, 2)}\n`]
    };
    const expectedFilenames = new Set(Object.values(expectedFiles).filter(Boolean).map(([filename]) => filename));

    for (const expected of Object.values(expectedFiles).filter(Boolean)) {
      const [filename, content] = expected;
      const target = path.join(outDir, filename);
      let actual = '';
      try {
        actual = await readFile(target, 'utf8');
      } catch {
        failures.push(`missing generated output: ${target}`);
        continue;
      }
      if (actual !== content) {
        failures.push(`stale generated output: ${target}`);
      }
    }

    const actualEntries = await readdir(outDir, { withFileTypes: true }).catch(() => []);
    for (const actualEntry of actualEntries) {
      if (!expectedFilenames.has(actualEntry.name)) {
        failures.push(`obsolete generated output: ${path.join(outDir, actualEntry.name)}`);
      }
    }

    for (const [mode, validation] of Object.entries(result.report.validation)) {
      for (const warning of validation.warnings) {
        failures.push(`${entry.file} ${mode}: ${warning}`);
      }
    }
  }

  return { ok: failures.length === 0, failures };
}

async function findSkillFiles(inputPath) {
  const stats = await statPath(inputPath);
  if (stats.isFile()) {
    return [{ file: inputPath, name: slugFromFile(inputPath) }];
  }

  const entries = [];
  const children = await readdir(inputPath, { withFileTypes: true });
  for (const child of children) {
    if (child.isDirectory()) {
      const candidate = path.join(inputPath, child.name, 'SKILL.md');
      const candidateStats = await statPath(candidate).catch(() => null);
      if (candidateStats?.isFile()) entries.push({ file: candidate, name: child.name });
    } else if (child.isFile() && child.name.endsWith('.md')) {
      entries.push({ file: path.join(inputPath, child.name), name: slugFromFile(child.name) });
    }
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return entries;
}

async function statPath(file) {
  const { stat } = await import('node:fs/promises');
  return stat(file);
}

function savings(sourceBytes, outputBytes) {
  if (!sourceBytes) return 0;
  return Number((((sourceBytes - outputBytes) / sourceBytes) * 100).toFixed(1));
}

function slugFromFile(file) {
  return path.basename(file).replace(/\.md$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-');
}
