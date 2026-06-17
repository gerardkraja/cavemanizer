import path from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

import { activateCavemanizedSkills, restoreActivatedSkills } from './activation.js';
import { checkPath, compressPath } from './compress.js';
import { installSkills, planInstall } from './install.js';
import { markCompactSource, unmarkCompactSource } from './markers.js';
import { discoverRealSkills } from './realSkills.js';
import { syncCavemanizedSkills } from './sync.js';

export async function main(argv = process.argv.slice(2), io = process) {
  const [command, ...rest] = argv;

  try {
    if (!command || command === '--help' || command === '-h') {
      io.stdout.write(helpText());
      return 0;
    }

    if (command === 'compress') return await compressCommand(rest, io);
    if (command === 'check') return await checkCommand(rest, io);
    if (command === 'install') return await installCommand(rest, io);
    if (command === 'sync') return await syncCommand(rest, io);
    if (command === 'activate') return await activateCommand(rest, io);
    if (command === 'restore') return await restoreCommand(rest, io);
    if (command === 'mark-compact') return await compactMarkerCommand(rest, io, true);
    if (command === 'unmark-compact') return await compactMarkerCommand(rest, io, false);
    if (command === 'list-real-skills') return await listRealSkillsCommand(rest, io);

    io.stderr.write(`Unknown command: ${command}\n\n${helpText()}`);
    return 2;
  } catch (error) {
    io.stderr.write(`${error.message}\n`);
    return 1;
  }
}

async function compressCommand(args, io) {
  const options = parseOptions(args);
  const input = options.positionals[0];
  if (!input) throw new Error('compress requires an input file or fixture directory');
  const outDir = options.outDir ?? 'dist/cavemanizer';

  const results = await compressPath(path.resolve(input), {
    outDir: path.resolve(outDir),
    providerName: options.provider ?? 'fixture',
    providerOptions: { model: options.model, apiKey: options.apiKey },
    modes: modesFromOption(options.mode),
    budget: options.budget ? Number(options.budget) : null
  });

  for (const result of results) {
    io.stdout.write(formatSummary(result));
  }
  return 0;
}

async function checkCommand(args, io) {
  const options = parseOptions(args);
  const input = options.positionals[0];
  if (!input) throw new Error('check requires an input file or fixture directory');
  const outDir = options.outDir ?? 'dist/cavemanizer';

  const result = await checkPath(path.resolve(input), {
    outDir: path.resolve(outDir),
    providerName: options.provider ?? 'fixture',
    providerOptions: { model: options.model, apiKey: options.apiKey },
    modes: modesFromOption(options.mode),
    budget: options.budget ? Number(options.budget) : null
  });

  if (!result.ok) {
    for (const failure of result.failures) io.stderr.write(`${failure}\n`);
    return 1;
  }
  io.stdout.write('generated outputs current\n');
  return 0;
}

async function installCommand(args, io) {
  const options = parseOptions(args);
  const repoRoot = path.resolve(options.positionals[0] ?? '.');
  const agents = collectAgents(options.agent);
  const skillRoot = path.resolve(options.skillRoot ?? path.join(repoRoot, 'skills'));
  const home = options.home ? path.resolve(options.home) : process.env.HOME;
  if (!home) throw new Error('Cannot determine HOME. Pass --home <path>.');

  const installOptions = { agents, home, skillRoot };
  if (options.dryRun) {
    const plan = await planInstall(installOptions);
    for (const op of plan.operations) {
      io.stdout.write(`${op.action} ${op.source} -> ${op.target}\n`);
    }
    if (options.sync) {
      const syncOk = await runSyncForAgents(options, agents, home, io);
      return syncOk ? 0 : 1;
    }
    return 0;
  }

  const result = await installSkills(installOptions);
  for (const op of result.operations) {
    io.stdout.write(`${op.action} ${op.source} -> ${op.target}\n`);
  }
  if (options.sync) {
    const syncOk = await runSyncForAgents(options, agents, home, io);
    return syncOk ? 0 : 1;
  }
  return 0;
}

async function syncCommand(args, io) {
  const options = parseOptions(args);
  const home = options.home ? path.resolve(options.home) : process.env.HOME;
  if (!home) throw new Error('Cannot determine HOME. Pass --home <path>.');
  const agents = collectAgents(options.agent, 'claude');
  const ok = await runSyncForAgents(options, agents, home, io);
  return ok ? 0 : 1;
}

async function activateCommand(args, io) {
  const options = parseOptions(args);
  const home = options.home ? path.resolve(options.home) : process.env.HOME;
  if (!home) throw new Error('Cannot determine HOME. Pass --home <path>.');
  const agents = collectAgents(options.agent, 'claude');
  const ok = await runActivationForAgents(options, agents, home, io);
  return ok ? 0 : 1;
}

async function restoreCommand(args, io) {
  const options = parseOptions(args);
  const home = options.home ? path.resolve(options.home) : process.env.HOME;
  if (!home) throw new Error('Cannot determine HOME. Pass --home <path>.');
  const agents = collectAgents(options.agent, 'claude');
  let ok = true;
  for (const agent of agents) {
    const result = await restoreActivatedSkills({ agent, home, dryRun: Boolean(options.dryRun) });
    io.stdout.write(formatActivationSummary(result, 'restore'));
    for (const failure of result.failures) io.stderr.write(`${failure}\n`);
    if (!result.ok) ok = false;
  }
  return ok ? 0 : 1;
}

async function compactMarkerCommand(args, io, compact) {
  const options = parseOptions(args);
  const input = options.positionals[0];
  const command = compact ? 'mark-compact' : 'unmark-compact';
  if (!input) throw new Error(`${command} requires a SKILL.md path`);
  const file = path.resolve(input);
  const source = await readFile(file, 'utf8');
  const next = compact ? markCompactSource(source) : unmarkCompactSource(source);
  await writeFile(file, next);
  io.stdout.write(`${compact ? 'marked compact' : 'removed compact marker'} ${file}\n`);
  return 0;
}

async function listRealSkillsCommand(args, io) {
  const options = parseOptions(args);
  const home = options.home ? path.resolve(options.home) : process.env.HOME;
  const skills = await discoverRealSkills({ home });
  if (!skills.length) {
    io.stdout.write('no local Codex/Claude skills found\n');
    return 0;
  }
  for (const skill of skills) {
    io.stdout.write(`${skill.agent}\t${skill.id}\t${skill.caveman ? 'caveman' : '-'}\t${skill.path}\n`);
  }
  return 0;
}

function parseOptions(args) {
  const options = { positionals: [] };
  const booleanOptions = new Set(['dryRun', 'check', 'sync', 'activate', 'noClean']);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg.startsWith('--')) {
      options.positionals.push(arg);
      continue;
    }
    const [rawKey, inlineValue] = arg.slice(2).split('=', 2);
    const key = toCamel(rawKey);
    if (booleanOptions.has(key)) {
      options[key] = true;
      continue;
    }
    const value = inlineValue ?? args[index + 1];
    if (inlineValue === undefined) index += 1;
    if (value === undefined) throw new Error(`Missing value for --${rawKey}`);
    if (key === 'agent') {
      options.agent = [...(Array.isArray(options.agent) ? options.agent : []), value];
    } else {
      options[key] = value;
    }
  }
  return options;
}

function modesFromOption(mode = 'caveman') {
  if (mode === 'caveman') return ['caveman'];
  throw new Error(`Unknown mode: ${mode}`);
}

function collectAgents(agentOption, defaultAgent = 'codex') {
  if (!agentOption) return [defaultAgent];
  return Array.isArray(agentOption) ? agentOption : [agentOption];
}

async function runSyncForAgents(options, agents, home, io) {
  let ok = true;
  for (const agent of agents) {
    if (!['codex', 'claude'].includes(agent)) {
      io.stderr.write(`sync does not support agent: ${agent}\n`);
      ok = false;
      continue;
    }
    const result = await syncCavemanizedSkills({
      agent,
      home,
      outDir: syncOutDir(options.outDir, home, agent, agents.length),
      providerName: options.provider ?? 'fixture',
      providerOptions: { model: options.model, apiKey: options.apiKey },
      budget: options.budget ? Number(options.budget) : null,
      check: Boolean(options.check),
      dryRun: Boolean(options.dryRun),
      clean: !options.noClean
    });
    io.stdout.write(formatSyncSummary(result));
    for (const failure of result.failures) io.stderr.write(`${failure}\n`);
    if (!result.ok) ok = false;
    if (result.ok && options.activate && !options.check) {
      const activation = await activateCavemanizedSkills({
        agent,
        home,
        outDir: result.outDir,
        dryRun: Boolean(options.dryRun)
      });
      io.stdout.write(formatActivationSummary(activation, 'activate'));
      for (const failure of activation.failures) io.stderr.write(`${failure}\n`);
      if (!activation.ok) ok = false;
    }
  }
  return ok;
}

async function runActivationForAgents(options, agents, home, io) {
  let ok = true;
  for (const agent of agents) {
    const result = await activateCavemanizedSkills({
      agent,
      home,
      outDir: syncOutDir(options.outDir, home, agent, agents.length),
      dryRun: Boolean(options.dryRun)
    });
    io.stdout.write(formatActivationSummary(result, 'activate'));
    for (const failure of result.failures) io.stderr.write(`${failure}\n`);
    if (!result.ok) ok = false;
  }
  return ok;
}

function syncOutDir(outDirOption, home, agent, agentCount) {
  if (outDirOption) {
    const base = path.resolve(outDirOption);
    return agentCount === 1 ? base : path.join(base, agent);
  }
  return path.join(home, '.cavemanizer', agent, 'skills');
}

function formatSummary(result) {
  const lines = [`${result.sourceName} -> ${result.outDir}`];
  for (const mode of result.report.modes) {
    const counts = result.report.counts[mode];
    lines.push(`  ${mode}: ${counts.estimatedTokens} est tokens, ${result.report.savings[mode]}% bytes saved`);
    const warnings = result.report.validation[mode].warnings;
    if (warnings.length) lines.push(`  ${mode} warnings: ${warnings.join('; ')}`);
  }
  return `${lines.join('\n')}\n`;
}

function formatSyncSummary(result) {
  const lines = [`${result.agent} sync -> ${result.outDir}`];
  if (!result.operations.length) {
    lines.push('  no skills found');
  } else {
    for (const op of result.operations) lines.push(`  ${op.action} ${op.skill}`);
  }
  if (result.summary.skills) {
    lines.push(
      `  ${formatTokenDelta(result.summary)} (${result.summary.sourceEstimatedTokens} -> ${result.summary.cavemanEstimatedTokens}, ${result.summary.byteSavings}% bytes)`
    );
  }
  return `${lines.join('\n')}\n`;
}

function formatActivationSummary(result, label) {
  const lines = [`${result.agent} ${label}`];
  if (!result.operations.length) {
    lines.push('  no activated skills');
  } else {
    for (const op of result.operations) lines.push(`  ${op.action} ${op.skill}`);
  }
  return `${lines.join('\n')}\n`;
}

function formatTokenDelta(summary) {
  if (summary.estimatedTokensSaved > 0) return `saved ${summary.estimatedTokensSaved} est tokens`;
  if (summary.estimatedTokensSaved < 0) return `added ${Math.abs(summary.estimatedTokensSaved)} est tokens`;
  return 'saved 0 est tokens';
}

function helpText() {
  return `cavemanizer

Commands:
  compress <file-or-fixtures-dir> --out-dir <dir> [--provider fixture|openai] [--mode caveman]
  check <file-or-fixtures-dir> --out-dir <dir> [--provider fixture|openai] [--mode caveman]
  install [repo-root] [--agent codex] [--agent claude] [--sync] [--activate] [--provider fixture|openai] [--dry-run]
  sync [--agent claude] [--out-dir <dir>] [--provider fixture|openai] [--activate] [--check] [--dry-run]
  activate [--agent claude] [--out-dir <dir>] [--dry-run]
  restore [--agent claude] [--dry-run]
  mark-compact <SKILL.md>
  unmark-compact <SKILL.md>
  list-real-skills [--home <path>]
`;
}

function toCamel(value) {
  return value.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}
