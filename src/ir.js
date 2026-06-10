const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/;
const CODE_BLOCK_RE = /```[\s\S]*?```/g;
const INLINE_CODE_RE = /`([^`\n]+)`/g;
const URL_RE = /https?:\/\/[^\s)<>"']+/g;
const ENV_RE = /\b[A-Z][A-Z0-9_]{2,}\b/g;
const COMMAND_STARTERS = [
  'npm',
  'pnpm',
  'yarn',
  'node',
  'npx',
  'git',
  'gh',
  'curl',
  'bash',
  'sh',
  'python',
  'python3',
  'pip',
  'uv',
  'docker',
  'kubectl',
  'make',
  'cargo',
  'go',
  'pytest',
  'rg',
  'grep',
  'sed',
  'cat',
  'ls',
  'cp',
  'mv',
  'rm',
  'mkdir',
  'touch',
  'chmod',
  'chown'
];
const COMMAND_STARTER_RE = COMMAND_STARTERS.map(escapeRegExp).join('|');
const COMMAND_RE = new RegExp(`(?:^|\\b(?:run|execute|call|use)\\s+)(${COMMAND_STARTER_RE})\\b([^\\n]*)`, 'gi');
const COMMAND_SPLIT_RE = new RegExp(`\\s+and\\s+(?=(${COMMAND_STARTER_RE})\\b)`, 'gi');

const ORDINALS = ['First', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];

export function extractProtectedContent(source) {
  const frontmatter = source.match(FRONTMATTER_RE)?.[0] ?? '';
  const codeBlocks = [...source.matchAll(CODE_BLOCK_RE)].map((match, index) => ({
    index: index + 1,
    text: match[0]
  }));

  const textWithoutCodeBlocks = source.replace(CODE_BLOCK_RE, '');
  const textWithoutUrls = textWithoutCodeBlocks.replace(URL_RE, '');

  return {
    frontmatter,
    codeBlocks,
    inlineCode: unique([...textWithoutCodeBlocks.matchAll(INLINE_CODE_RE)].map((match) => match[1].trim()).filter(Boolean)),
    commands: unique(extractCommands(textWithoutCodeBlocks)),
    urls: unique([...textWithoutCodeBlocks.matchAll(URL_RE)].map((match) => trimTrailingPunctuation(match[0]))),
    envVars: unique([...textWithoutCodeBlocks.matchAll(ENV_RE)].map((match) => match[0]).filter(isLikelyEnvVar)),
    paths: unique(extractPaths(textWithoutUrls))
  };
}

export function validateRenderedDocument(rendered, protectedContent) {
  const warnings = [];

  if (protectedContent.frontmatter && !rendered.startsWith(protectedContent.frontmatter)) {
    warnings.push('frontmatter changed or missing');
  }

  for (const codeBlock of protectedContent.codeBlocks) {
    if (!rendered.includes(codeBlock.text)) {
      warnings.push(`missing code block ${codeBlock.index}`);
    }
  }

  for (const inline of protectedContent.inlineCode) {
    if (!rendered.includes(`\`${inline}\``) && !rendered.includes(inline)) {
      warnings.push(`missing inline code \`${inline}\``);
    }
  }

  for (const command of protectedContent.commands ?? []) {
    if (!rendered.includes(command)) {
      warnings.push(`missing command ${command}`);
    }
  }

  for (const url of protectedContent.urls) {
    if (!rendered.includes(url)) {
      warnings.push(`missing URL ${url}`);
    }
  }

  for (const envVar of protectedContent.envVars) {
    if (!rendered.includes(envVar)) {
      warnings.push(`missing env var ${envVar}`);
    }
  }

  for (const path of protectedContent.paths) {
    if (!rendered.includes(path)) {
      warnings.push(`missing path ${path}`);
    }
  }

  return { warnings };
}

export function estimateTokens(text) {
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / 4));
}

export function countText(text) {
  return {
    bytes: Buffer.byteLength(text, 'utf8'),
    chars: text.length,
    estimatedTokens: estimateTokens(text)
  };
}

export function fixtureExtractIr(source, { sourceName = 'SKILL.md' } = {}) {
  const protectedContent = extractProtectedContent(source);
  const prose = source
    .replace(FRONTMATTER_RE, '')
    .replace(CODE_BLOCK_RE, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  const frontmatterValues = parseFrontmatterValues(protectedContent.frontmatter);
  const title = extractTitle(prose, frontmatterValues.name ?? sourceName.replace(/\/SKILL\.md$/, ''));
  const description = frontmatterValues.description ?? extractFirstParagraph(prose) ?? `Compact workflow for ${title}.`;

  return {
    name: frontmatterValues.name ?? slugify(title),
    title,
    description: compactSentence(description),
    triggers: extractTriggers(prose, description),
    rules: extractRules(prose),
    workflow: extractWorkflow(prose),
    examples: extractExamples(prose),
    references: unique([...protectedContent.urls, ...protectedContent.paths]),
    omissions: [],
    sourceName
  };
}

export function buildIrPrompt(source, { sourceName = 'SKILL.md', budget = null } = {}) {
  return `Extract Instruction-IR from this agent skill or instruction file.

Return JSON only. Preserve meaning. Do not render Markdown.

IR shape:
{
  "name": "short id",
  "title": "human title",
  "description": "one compact sentence",
  "triggers": ["when to use"],
  "rules": ["MUST/NEVER/SHOULD rules, exact inline code preserved"],
  "workflow": ["ordered action"],
  "examples": ["only examples that encode behavior"],
  "references": ["important URLs/paths/resources"],
  "omissions": ["anything risky to omit"],
  "sourceName": "${jsonEscape(sourceName)}"
}

Hard requirements:
- Preserve MUST/NEVER semantics.
- Preserve code blocks, inline code, commands, URLs, paths, env vars exactly in the fields where referenced.
- Remove rationale, sales copy, repeated warnings, decorative examples.
- Keep output dense and executable by an agent.
${budget ? `- Aim rendered output at <= ${budget} tokens.` : ''}

SOURCE:
${source}`;
}

export function normalizeIr(candidate, { sourceName = 'SKILL.md' } = {}) {
  const ir = typeof candidate === 'object' && candidate !== null ? candidate : {};
  return {
    name: stringOr(ir.name, slugify(sourceName.replace(/\/SKILL\.md$/, ''))),
    title: stringOr(ir.title, stringOr(ir.name, 'Skill')),
    description: stringOr(ir.description, ''),
    triggers: arrayOfStrings(ir.triggers),
    rules: arrayOfStrings(ir.rules),
    workflow: arrayOfStrings(ir.workflow),
    examples: arrayOfStrings(ir.examples),
    references: arrayOfStrings(ir.references),
    omissions: arrayOfStrings(ir.omissions),
    sourceName: stringOr(ir.sourceName, sourceName)
  };
}

function parseFrontmatterValues(frontmatter) {
  if (!frontmatter) return {};
  const values = {};
  const body = frontmatter.replace(/^---\r?\n/, '').replace(/\r?\n---$/, '');
  for (const line of body.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    values[match[1]] = match[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return values;
}

function extractTitle(prose, fallback) {
  const heading = prose.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading || titleCase(fallback.replace(/[-_]/g, ' '));
}

function extractFirstParagraph(prose) {
  return prose
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/^#+\s+.*$/gm, '').trim())
    .find(Boolean);
}

function extractTriggers(prose, description) {
  const triggers = [];
  const sentenceSource = prose.replace(/\s+/g, ' ');
  for (const match of sentenceSource.matchAll(/(?:Use when|Use this skill when|When to use:?)\s+([^.!?]+[.!?]?)/gi)) {
    triggers.push(compactSentence(match[1]));
  }
  if (triggers.length === 0 && description) {
    triggers.push(compactSentence(description));
  }
  return unique(triggers).slice(0, 5);
}

function extractRules(prose) {
  const rules = [];
  for (const paragraph of prose.split(/\n\s*\n/)) {
    const paragraphText = paragraph.replace(/^#+\s+.*$/gm, '').replace(/\s+/g, ' ').trim();
    if (!/(MUST NOT|MUST|NEVER|SHOULD NOT|DO NOT|REQUIRED)/i.test(paragraphText)) continue;
    for (const sentence of splitSentences(paragraphText)) {
      if (!/(MUST NOT|MUST|NEVER|SHOULD NOT|DO NOT|REQUIRED)/i.test(sentence)) continue;
      const rule = compactRule(sentence);
      if (rule) rules.push(rule);
    }
  }
  return unique(rules).slice(0, 12);
}

function extractWorkflow(prose) {
  const workflow = [];

  for (const ordinal of ORDINALS) {
    const regex = new RegExp(`${ordinal},?\\s+([^.!?]+[.!?]?)`, 'i');
    const match = prose.match(regex);
    if (match) workflow.push(compactSentence(match[1]));
  }

  if (workflow.length === 0) {
    const workflowBlock = prose.match(/workflow[^.\n:]*[:.]([\s\S]{0,600})/i)?.[1] ?? '';
    for (const line of workflowBlock.split(/\r?\n/)) {
      const cleaned = line.replace(/^[-*\d.\s]+/, '').trim();
      if (cleaned) workflow.push(compactSentence(cleaned));
    }
  }

  if (workflow.length === 0) {
    workflow.push('Read source context.');
    workflow.push('Apply rules.');
    workflow.push('Verify protected content survived.');
  }

  return unique(workflow).slice(0, 10);
}

function extractExamples(prose) {
  const examples = [];
  for (const match of prose.matchAll(/example[^:\n]*:\s*([^\n]+)/gi)) {
    examples.push(compactSentence(match[1]));
  }
  return unique(examples).slice(0, 3);
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function extractPaths(text) {
  const paths = [];
  const pathRe = /(?:^|[\s(["'])((?:~|\.{1,2})?\/[A-Za-z0-9._~@%+=:,/-]+|[A-Za-z0-9._-]+\/[A-Za-z0-9._~@%+=:,/-]+)(?=$|[\s)"',.])/gm;
  for (const match of text.matchAll(pathRe)) {
    const path = trimTrailingPunctuation(match[1]);
    if (!path.includes('://') && path.length > 1) {
      paths.push(path);
    }
  }
  return paths;
}

function extractCommands(text) {
  const commands = [];
  const textWithoutInlineCode = text.replace(INLINE_CODE_RE, '');
  for (const line of textWithoutInlineCode.split(/\r?\n/)) {
    const normalizedLine = line.replace(/^[-*\d.\s]+/, '').trim();
    for (const match of normalizedLine.matchAll(COMMAND_RE)) {
      const commandText = `${match[1]}${match[2]}`.trim();
      for (const command of commandText.split(COMMAND_SPLIT_RE)) {
        const normalizedCommand = normalizeCommand(command);
        if (isLikelyCommand(normalizedCommand)) commands.push(normalizedCommand);
      }
    }
  }
  return commands;
}

function normalizeCommand(value) {
  return trimTrailingPunctuation(value)
    .replace(/\s+/g, ' ')
    .replace(/^["'(:]+|["')]+$/g, '')
    .trim();
}

function isLikelyCommand(value) {
  if (!value) return false;
  const [starter] = value.split(/\s+/, 1);
  if (!COMMAND_STARTERS.includes(starter)) return false;
  return value.includes(' ') || value.includes('--') || value.includes('|');
}

function isLikelyEnvVar(value) {
  const commonWords = new Set(['MUST', 'NEVER', 'SHOULD', 'REQUIRED', 'JSON', 'URL', 'CLI']);
  return value.includes('_') || (!commonWords.has(value) && value.length >= 8);
}

function compactRule(rule) {
  return compactSentence(rule)
    .replace(/^You\s+/i, '')
    .replace(/^The agent\s+/i, '')
    .replace(/\bshould prefer\b/gi, 'prefer')
    .replace(/\bit is important to\b/gi, 'must')
    .trim();
}

function compactSentence(sentence) {
  return sentence
    .replace(/\s+/g, ' ')
    .replace(/\bvery\s+/gi, '')
    .replace(/\breally\s+/gi, '')
    .replace(/\bin order to\b/gi, 'to')
    .trim()
    .replace(/\s+([.,;:!?])$/g, '$1');
}

function titleCase(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'skill';
}

function arrayOfStrings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean) : [];
}

function stringOr(value, fallback) {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function trimTrailingPunctuation(value) {
  return value.replace(/[.,;:!?]+$/g, '');
}

function jsonEscape(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
