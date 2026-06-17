import assert from 'node:assert/strict';
import { mkdir, writeFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { loadCavemanizerEnv } from '../src/env.js';

test('loadCavemanizerEnv loads export assignments from ~/.cavemanizer/env', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-env-'));
  const home = path.join(root, 'home');
  await mkdir(path.join(home, '.cavemanizer'), { recursive: true });
  await writeFile(path.join(home, '.cavemanizer', 'env'), `# cavemanizer secrets
export OPENAI_API_KEY=from-file
CAVEMANIZER_MODEL="gpt-test"
`);

  const targetEnv = {};
  const loaded = await loadCavemanizerEnv({ home, env: targetEnv });

  assert.deepEqual(loaded.sort(), ['CAVEMANIZER_MODEL', 'OPENAI_API_KEY']);
  assert.equal(targetEnv.OPENAI_API_KEY, 'from-file');
  assert.equal(targetEnv.CAVEMANIZER_MODEL, 'gpt-test');
});

test('loadCavemanizerEnv does not override existing process environment values', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-env-existing-'));
  const home = path.join(root, 'home');
  await mkdir(path.join(home, '.cavemanizer'), { recursive: true });
  await writeFile(path.join(home, '.cavemanizer', 'env'), 'export OPENAI_API_KEY=from-file\n');

  const targetEnv = { OPENAI_API_KEY: 'already-set' };
  const loaded = await loadCavemanizerEnv({ home, env: targetEnv });

  assert.deepEqual(loaded, []);
  assert.equal(targetEnv.OPENAI_API_KEY, 'already-set');
});

test('loadCavemanizerEnv loads Windows env.cmd set assignments', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'cavemanizer-env-win-'));
  const home = path.join(root, 'home');
  await mkdir(path.join(home, '.cavemanizer'), { recursive: true });
  await writeFile(path.join(home, '.cavemanizer', 'env.cmd'), 'set OPENAI_API_KEY=from-cmd\r\n');

  const targetEnv = {};
  const loaded = await loadCavemanizerEnv({ home, env: targetEnv });

  assert.deepEqual(loaded, ['OPENAI_API_KEY']);
  assert.equal(targetEnv.OPENAI_API_KEY, 'from-cmd');
});
