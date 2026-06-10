import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { compressDocument, writeCompressionOutputs } from '../src/compress.js';

const VERBOSE_SKILL = `---
name: careful-editor
description: Use this skill when editing repositories with user changes.
---

# Careful Editor

Use this skill when you need to edit a repository while preserving user work.
It is important to understand that the user may have uncommitted files, generated
outputs, or half-finished changes that are unrelated to your current task.

You MUST inspect \`git status --short\` before editing. You MUST NOT discard,
reset, overwrite, or revert files that you did not change. You should prefer
small scoped edits and explain any conflict before proceeding.

The workflow is straightforward but should be followed carefully. First, inspect
the repository state. Second, identify files related to the request. Third, edit
only those files. Fourth, run the relevant test command. Fifth, report the exact
verification that was run.

\`\`\`bash
git status --short
npm test
\`\`\`

For more context, read https://example.com/careful-editor.
`;

test('compressDocument uses fixture provider to create IR-backed compact outputs', async () => {
  const result = await compressDocument(VERBOSE_SKILL, {
    sourceName: 'careful-editor/SKILL.md',
    providerName: 'fixture'
  });

  assert.equal(result.ir.name, 'careful-editor');
  assert.ok(result.ir.rules.some((rule) => rule.includes('MUST inspect `git status --short`')));
  assert.ok(result.outputs.caveman.includes('git status --short'));
  assert.deepEqual(Object.keys(result.outputs), ['caveman']);
  assert.deepEqual(result.report.validation.caveman.warnings, []);
  assert.ok(result.report.counts.caveman.bytes < result.report.counts.source.bytes);
});

test('writeCompressionOutputs writes markdown outputs, IR, and report', async () => {
  const tempDir = await mkdtemp(path.join(tmpdir(), 'cavemanizer-compress-'));
  const result = await compressDocument(VERBOSE_SKILL, {
    sourceName: 'careful-editor/SKILL.md',
    providerName: 'fixture'
  });

  await writeCompressionOutputs(result, tempDir);

  const caveman = await readFile(path.join(tempDir, 'cavemanized.md'), 'utf8');
  const report = JSON.parse(await readFile(path.join(tempDir, 'report.json'), 'utf8'));
  const files = await readdir(tempDir);

  assert.ok(caveman.startsWith('---\nname: careful-editor'));
  assert.deepEqual(files.sort(), ['cavemanized.md', 'ir.json', 'report.json']);
  assert.equal(report.sourceName, 'careful-editor/SKILL.md');
  assert.deepEqual(report.modes, ['caveman']);
  await stat(path.join(tempDir, 'ir.json'));
});

test('budgeted compression uses tighter renderer while preserving protected content', async () => {
  const source = await readFile(path.resolve('examples/fixtures/hard-gate/SKILL.md'), 'utf8');
  const result = await compressDocument(source, {
    sourceName: 'hard-gate/SKILL.md',
    providerName: 'fixture',
    budget: 120
  });

  assert.ok(result.outputs.caveman.includes('`rm`'));
  assert.deepEqual(result.report.validation.caveman.warnings, []);
  assert.ok(result.report.counts.caveman.bytes < result.report.counts.source.bytes);
});
