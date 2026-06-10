import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractProtectedContent, validateRenderedDocument } from '../src/ir.js';

const SOURCE = `---
name: protected-skill
description: Test exact preservation.
---

# Protected Skill

Use when a workflow references https://example.com/docs and \`npm test -- --runInBand\`.

Set \`OPENAI_API_KEY\` before running \`node bin/cavemanizer.js compress ./skills\`.
Read /Users/example/project/AGENTS.md before editing.

\`\`\`bash
export OPENAI_API_KEY=sk-test
npm test
\`\`\`

\`\`\`json
{"ok": true, "path": "/tmp/cavemanizer"}
\`\`\`
`;

test('extractProtectedContent captures frontmatter and exact protected islands', () => {
  const protectedContent = extractProtectedContent(SOURCE);

  assert.equal(protectedContent.frontmatter.trim(), '---\nname: protected-skill\ndescription: Test exact preservation.\n---');
  assert.equal(protectedContent.codeBlocks.length, 2);
  assert.ok(protectedContent.codeBlocks[0].text.includes('export OPENAI_API_KEY=sk-test'));
  assert.ok(protectedContent.inlineCode.includes('npm test -- --runInBand'));
  assert.ok(protectedContent.inlineCode.includes('OPENAI_API_KEY'));
  assert.ok(protectedContent.urls.includes('https://example.com/docs'));
  assert.ok(protectedContent.paths.includes('/Users/example/project/AGENTS.md'));
});

test('extractProtectedContent captures plain shell commands', () => {
  const source = `---
name: command-skill
description: Test command preservation.
---

# Command Skill

Before reporting, run npm test -- --runInBand and git status --short.
Then run node bin/cavemanizer.js sync --agent claude --check.
`;

  const protectedContent = extractProtectedContent(source);

  assert.ok(protectedContent.commands.includes('npm test -- --runInBand'));
  assert.ok(protectedContent.commands.includes('git status --short'));
  assert.ok(protectedContent.commands.includes('node bin/cavemanizer.js sync --agent claude --check'));

  const validation = validateRenderedDocument(source.replace('npm test -- --runInBand', 'tests'), protectedContent);
  assert.ok(validation.warnings.some((warning) => warning.includes('missing command npm test -- --runInBand')));
});

test('validateRenderedDocument reports missing protected content', () => {
  const protectedContent = extractProtectedContent(SOURCE);
  const incomplete = `---
name: protected-skill
description: Test exact preservation.
---

# Protected Skill

Use when: workflow references https://example.com/docs.
`;

  const validation = validateRenderedDocument(incomplete, protectedContent);

  assert.ok(validation.warnings.some((warning) => warning.includes('code block 1')));
  assert.ok(validation.warnings.some((warning) => warning.includes('inline code `npm test -- --runInBand`')));
  assert.ok(validation.warnings.some((warning) => warning.includes('path /Users/example/project/AGENTS.md')));
});

test('validateRenderedDocument accepts output with protected content intact', () => {
  const protectedContent = extractProtectedContent(SOURCE);
  const validation = validateRenderedDocument(SOURCE, protectedContent);

  assert.deepEqual(validation.warnings, []);
});
