export function renderCaveman(ir, protectedContent, options = {}) {
  if (options.budget) return renderBudgetCaveman(ir, protectedContent);

  const sections = [];
  sections.push(renderHeader(protectedContent, ir.title));

  sections.push(renderList('Use when', ir.triggers));
  sections.push(renderList('Rules', ir.rules));
  sections.push(renderNumbered('Flow', ir.workflow));
  if (ir.examples.length) sections.push(renderList('Example shape', ir.examples.slice(0, 1)));
  sections.push(renderProtected('Keep exact', protectedContent, { terse: false, existingText: sections.join('\n\n') }));
  if (ir.omissions.length) sections.push(renderList('Risk notes', ir.omissions));

  return cleanMarkdown(sections.filter(Boolean).join('\n\n'));
}

function renderBudgetCaveman(ir, protectedContent) {
  const sections = [renderHeader(protectedContent, ir.title)];
  const rules = compactRules(ir.rules, ir.triggers);

  if (ir.triggers.length) sections.push(`Use: ${compactText(ir.triggers[0])}`);
  if (rules.length) sections.push(`Rules:\n${rules.map((rule) => `- ${rule}`).join('\n')}`);
  if (ir.workflow.length) sections.push(`Flow: ${compactFlow(ir.workflow)}`);
  if (ir.examples.length) sections.push(`Example: ${compactText(ir.examples[0])}`);
  sections.push(renderProtected('Keep', protectedContent, { terse: true, existingText: sections.join('\n\n') }));

  return cleanMarkdown(sections.filter(Boolean).join('\n\n'));
}

function renderHeader(protectedContent, title) {
  const heading = `# ${title}`;
  return protectedContent.frontmatter ? `${protectedContent.frontmatter}\n\n${heading}` : heading;
}

function renderList(label, values) {
  if (!values.length) return '';
  return `${label}:\n${values.map((value) => `- ${value}`).join('\n')}`;
}

function renderNumbered(label, values) {
  if (!values.length) return '';
  return `${label}:\n${values.map((value, index) => `${index + 1}. ${value}`).join('\n')}`;
}

function renderProtected(label, protectedContent, { terse, existingText = '' }) {
  const refs = [
    ...protectedContent.inlineCode.map((value) => `\`${value}\``),
    ...(protectedContent.commands ?? []),
    ...protectedContent.urls,
    ...protectedContent.paths,
    ...protectedContent.envVars
  ];
  const uniqueRefs = uniqueByBareRef(refs).filter((ref) => {
    const bare = ref.startsWith('`') && ref.endsWith('`') ? ref.slice(1, -1) : ref;
    return !existingText.includes(ref) && !existingText.includes(bare);
  });
  const codeBlocks = protectedContent.codeBlocks.map((block) => block.text);
  if (!uniqueRefs.length && !codeBlocks.length) return '';

  const lines = [];
  if (uniqueRefs.length) {
    if (terse) {
      lines.push(`${label}: ${uniqueRefs.join('; ')}`);
    } else {
      lines.push(`${label}:`);
      for (const ref of uniqueRefs) lines.push(`- ${ref}`);
    }
  }
  if (codeBlocks.length) {
    if (lines.length) lines.push('');
    lines.push(...codeBlocks);
  }
  return lines.join('\n');
}

function uniqueByBareRef(refs) {
  const seen = new Set();
  const result = [];
  for (const ref of refs) {
    const bare = ref.startsWith('`') && ref.endsWith('`') ? ref.slice(1, -1) : ref;
    if (seen.has(bare)) continue;
    seen.add(bare);
    result.push(ref);
  }
  return result;
}

function cleanMarkdown(markdown) {
  return `${markdown.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function compactRules(rules, triggers) {
  const triggerText = triggers.join(' ').toLowerCase();
  return rules
    .map(compactText)
    .filter((rule) => !isDuplicateTriggerRule(rule, triggerText))
    .map((rule) =>
      rule
        .replace(/^You MUST NOT\b/i, 'MUST NOT')
        .replace(/^You MUST\b/i, 'MUST')
        .replace(/^You SHOULD\b/i, 'SHOULD')
        .replace(/\bthe user approves\b/gi, 'user approval')
        .replace(/\bfor explicit confirmation\b/gi, 'confirmation')
        .replace(/\bproduction code\b/gi, 'code')
        .replace(/\bbefore running\b/gi, 'before')
        .replace(/\s+/g, ' ')
        .trim()
    );
}

function compactFlow(workflow) {
  return workflow
    .map((step) =>
      compactText(step)
        .replace(/\bthe proposed design\b/gi, 'design')
        .replace(/\bonly the approved work\b/gi, 'approved work')
        .replace(/\band report the result\b/gi, '/report')
        .replace(/\s+/g, ' ')
        .trim()
    )
    .join(' -> ');
}

function compactText(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .replace(/^Use this skill when\s+/i, '')
    .replace(/\byou need to\b/gi, 'need to')
    .replace(/\bin order to\b/gi, 'to')
    .trim();
}

function isDuplicateTriggerRule(rule, triggerText) {
  if (!triggerText) return false;
  const normalizedRule = rule.toLowerCase().replace(/^use this skill when\s+/, '').replace(/[^\w]+/g, ' ').trim();
  const normalizedTrigger = triggerText.replace(/[^\w]+/g, ' ').trim();
  return normalizedRule.length > 30 && normalizedTrigger.includes(normalizedRule);
}
