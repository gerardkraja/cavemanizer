const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---(?=\r?\n|$)/;
const ACTIVE_MARKER_RE = /<!--\s*cavemanizer:\s*active\b[^>]*-->/i;
const COMPACT_COMMENT_RE = /<!--\s*cavemanizer:\s*(compact|skip)\s*-->/i;

export function isCreatorCompact(source) {
  if (COMPACT_COMMENT_RE.test(source)) return true;
  const frontmatter = source.match(FRONTMATTER_RE)?.[0] ?? '';
  const values = parseFrontmatterValues(frontmatter);
  return ['compact', 'skip', 'true', 'yes'].includes(String(values.cavemanizer ?? '').toLowerCase())
    || ['true', 'yes'].includes(String(values.cavemanized ?? '').toLowerCase());
}

export function isActivatedSkill(source) {
  return ACTIVE_MARKER_RE.test(source);
}

export function withActiveMarker(source, { backupPath, generatedPath, sourceDigest }) {
  const marker = `<!-- cavemanizer: active; backup=${backupPath}; generated=${generatedPath}; sourceDigest=${sourceDigest} -->`;
  if (source.match(FRONTMATTER_RE)) {
    return source.replace(FRONTMATTER_RE, (frontmatter) => `${frontmatter}\n\n${marker}`);
  }
  return `${marker}\n\n${source}`;
}

export function markCompactSource(source) {
  if (isCreatorCompact(source)) return source;
  const frontmatter = source.match(FRONTMATTER_RE)?.[0] ?? '';
  if (!frontmatter) return `---\ncavemanizer: compact\n---\n\n${source}`;
  const marked = frontmatter.replace(/\r?\n---$/, '\ncavemanizer: compact\n---');
  return source.replace(frontmatter, marked);
}

export function unmarkCompactSource(source) {
  let next = source.replace(/<!--\s*cavemanizer:\s*(compact|skip)\s*-->\s*/gi, '');
  const frontmatter = next.match(FRONTMATTER_RE)?.[0] ?? '';
  if (!frontmatter) return next;
  const body = frontmatter
    .replace(/^---\r?\n/, '')
    .replace(/\r?\n---$/, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*cavemanizer:\s*(compact|skip|true|yes)\s*$/i.test(line))
    .filter((line) => !/^\s*cavemanized:\s*(true|yes)\s*$/i.test(line))
    .join('\n');
  const replacement = body.trim() ? `---\n${body}\n---` : '';
  return next.replace(frontmatter, replacement).replace(/^\n{3,}/, '\n\n');
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
