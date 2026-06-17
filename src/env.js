import { readFile } from 'node:fs/promises';
import path from 'node:path';

export async function loadCavemanizerEnv({ home = process.env.HOME, env = process.env } = {}) {
  if (!home) return [];
  const loaded = [];
  const files = [
    { file: path.join(home, '.cavemanizer', 'env'), parser: parsePosixEnvLine },
    { file: path.join(home, '.cavemanizer', 'env.cmd'), parser: parseWindowsEnvLine }
  ];

  for (const { file, parser } of files) {
    let source = '';
    try {
      source = await readFile(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of source.split(/\r?\n/)) {
      const parsed = parser(line);
      if (!parsed || env[parsed.key]) continue;
      env[parsed.key] = parsed.value;
      loaded.push(parsed.key);
    }
  }

  return loaded;
}

function parsePosixEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const body = trimmed.startsWith('export ') ? trimmed.slice('export '.length).trim() : trimmed;
  return parseAssignment(body);
}

function parseWindowsEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.toLowerCase().startsWith('rem ')) return null;
  if (!trimmed.toLowerCase().startsWith('set ')) return null;
  return parseAssignment(trimmed.slice('set '.length).trim());
}

function parseAssignment(value) {
  const match = value.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
  if (!match) return null;
  return { key: match[1], value: stripQuotes(match[2].trim()) };
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"'))
    || (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
