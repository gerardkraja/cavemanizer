import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { activateCavemanizedSkills } from './activation.js';
import { syncCavemanizedSkills } from './sync.js';

const DEFAULT_CRON = '0 3 * * *';
const DEFAULT_INTERVAL_HOURS = 24;

export function scheduleFromOptions(options = {}) {
  if (options.cron) {
    validateDailyCron(options.cron);
    return { cron: options.cron, intervalHours: DEFAULT_INTERVAL_HOURS };
  }
  if (!options.every || options.every === 'daily') {
    return { cron: DEFAULT_CRON, intervalHours: DEFAULT_INTERVAL_HOURS };
  }
  throw new Error(`Unknown schedule interval: ${options.every}`);
}

export function isScheduleDue({ cron = DEFAULT_CRON, now = new Date(), lastSuccessAt } = {}) {
  validateDailyCron(cron);
  if (!lastSuccessAt) return true;
  const lastSuccess = new Date(lastSuccessAt);
  if (Number.isNaN(lastSuccess.getTime())) return true;
  return lastSuccess < lastScheduledOccurrence(cron, now);
}

export function planScheduleInstall(options = {}) {
  const agent = options.agent ?? 'claude';
  const home = options.home ?? process.env.HOME;
  if (!home) throw new Error('home is required');
  const platform = options.platform ?? process.platform;
  const backend = resolveBackend(options.backend, platform);
  const schedule = scheduleFromOptions(options);
  const paths = schedulePaths({ agent, home, platform });
  const config = scheduleConfig({ ...options, agent, home, backend, schedule, paths });
  const files = [
    { path: paths.configPath, content: `${JSON.stringify(config, null, 2)}\n` },
    { path: paths.scriptPath, content: scriptContent({ ...options, agent, paths, platform }), executable: true }
  ];
  const commands = [];
  let crontabBlock = '';

  if (backend === 'launchd') {
    files.push({ path: paths.launchdPlistPath, content: launchdPlist({ agent, paths, schedule }) });
    commands.push({ command: 'launchctl', args: ['unload', paths.launchdPlistPath], optional: true });
    commands.push({ command: 'launchctl', args: ['load', paths.launchdPlistPath] });
  } else if (backend === 'systemd') {
    files.push({ path: paths.systemdServicePath, content: systemdService({ agent, paths }) });
    files.push({ path: paths.systemdTimerPath, content: systemdTimer({ agent, schedule }) });
    commands.push({ command: 'systemctl', args: ['--user', 'daemon-reload'] });
    commands.push({ command: 'systemctl', args: ['--user', 'enable', '--now', `cavemanizer-${agent}.timer`] });
  } else if (backend === 'schtasks') {
    files.push({ path: paths.windowsTaskXmlPath, content: windowsTaskXml({ agent, paths, schedule }) });
    commands.push({ command: 'schtasks.exe', args: ['/Create', '/TN', windowsTaskName(agent), '/XML', paths.windowsTaskXmlPath, '/F'] });
  } else if (backend === 'cron') {
    crontabBlock = cronBlock({ agent, paths, schedule });
  }

  return { action: 'install', agent, backend, schedule, paths, config, files, commands, crontabBlock };
}

export function planScheduleUninstall(options = {}) {
  const agent = options.agent ?? 'claude';
  const home = options.home ?? process.env.HOME;
  if (!home) throw new Error('home is required');
  const platform = options.platform ?? process.platform;
  const backend = resolveBackend(options.backend, platform);
  const paths = schedulePaths({ agent, home, platform });
  const filesToRemove = [paths.configPath, paths.scriptPath];
  const commands = [];

  if (backend === 'launchd') {
    filesToRemove.push(paths.launchdPlistPath);
    commands.push({ command: 'launchctl', args: ['unload', paths.launchdPlistPath], optional: true });
  } else if (backend === 'systemd') {
    filesToRemove.push(paths.systemdServicePath, paths.systemdTimerPath);
    commands.push({ command: 'systemctl', args: ['--user', 'disable', '--now', `cavemanizer-${agent}.timer`], optional: true });
    commands.push({ command: 'systemctl', args: ['--user', 'daemon-reload'], optional: true });
  } else if (backend === 'schtasks') {
    filesToRemove.push(paths.windowsTaskXmlPath);
    commands.push({ command: 'schtasks.exe', args: ['/Delete', '/TN', windowsTaskName(agent), '/F'], optional: true });
  }

  return { action: 'uninstall', agent, backend, paths, filesToRemove, commands, marker: cronMarker(agent) };
}

export async function installSchedule(options = {}) {
  const plan = planScheduleInstall(options);
  if (options.dryRun) return { ...plan, dryRun: true };

  for (const file of plan.files) {
    await mkdir(path.dirname(file.path), { recursive: true });
    await writeFile(file.path, file.content);
    if (file.executable) await chmod(file.path, 0o755);
  }

  if (plan.backend === 'cron') {
    await installCronBlock(plan.agent, plan.crontabBlock);
  } else {
    for (const command of plan.commands) await runCommand(command);
  }

  return plan;
}

export async function uninstallSchedule(options = {}) {
  const plan = planScheduleUninstall(options);
  if (options.dryRun) return { ...plan, dryRun: true };

  if (plan.backend === 'cron') {
    await removeCronBlock(plan.agent);
  } else {
    for (const command of plan.commands) await runCommand(command);
  }

  for (const file of plan.filesToRemove) {
    await rm(file, { force: true });
  }
  return plan;
}

export async function scheduleStatus(options = {}) {
  const agent = options.agent ?? 'claude';
  const home = options.home ?? process.env.HOME;
  if (!home) throw new Error('home is required');
  const platform = options.platform ?? process.platform;
  const paths = schedulePaths({ agent, home, platform });
  const config = await readJson(paths.configPath).catch(() => null);
  const state = await readJson(paths.statePath).catch(() => null);
  return { agent, installed: Boolean(config), config, state, paths };
}

export async function runDueSchedule(options = {}) {
  const agent = options.agent ?? 'claude';
  const home = options.home ?? process.env.HOME;
  if (!home) throw new Error('home is required');
  const platform = options.platform ?? process.platform;
  const paths = schedulePaths({ agent, home, platform });
  const config = await readJson(paths.configPath);
  const previousState = await readJson(paths.statePath).catch(() => ({}));
  const now = options.now ?? new Date();
  const due = isScheduleDue({
    cron: config.cron,
    now,
    lastSuccessAt: previousState.lastSuccessAt
  });

  if (!due) return { agent, due: false, ran: false, state: previousState };

  const attemptState = {
    ...previousState,
    lastAttemptAt: now.toISOString()
  };
  await writeState(paths.statePath, attemptState);

  const sync = await syncCavemanizedSkills({
    agent,
    home,
    outDir: config.outDir,
    providerName: config.provider,
    providerOptions: { model: config.model },
    budget: config.budget,
    check: false,
    dryRun: false,
    clean: true
  });

  let activation = null;
  let ok = sync.ok;
  if (sync.ok && config.activate) {
    activation = await activateCavemanizedSkills({ agent, home, outDir: sync.outDir, dryRun: false });
    ok = activation.ok;
  }

  const state = {
    ...attemptState,
    lastResult: ok ? 'ok' : 'failed',
    lastSuccessAt: ok ? now.toISOString() : previousState.lastSuccessAt,
    lastFailureAt: ok ? previousState.lastFailureAt : now.toISOString()
  };
  await writeState(paths.statePath, state);

  return { agent, due: true, ran: true, ok, sync, activation, state };
}

function scheduleConfig({ agent, backend, schedule, providerName, model, budget, activate, outDir, paths }) {
  return {
    version: 1,
    agent,
    backend,
    cron: schedule.cron,
    intervalHours: schedule.intervalHours,
    provider: providerName ?? 'fixture',
    model: model ?? null,
    budget: budget ? Number(budget) : null,
    activate: Boolean(activate),
    outDir: outDir ?? null,
    logPath: paths.logPath,
    statePath: paths.statePath
  };
}

function resolveBackend(backend = 'auto', platform = process.platform) {
  if (backend !== 'auto') return backend;
  if (platform === 'darwin') return 'launchd';
  if (platform === 'linux') return 'systemd';
  if (platform === 'win32') return 'schtasks';
  return 'cron';
}

function schedulePaths({ agent, home, platform }) {
  const pathApi = platform === 'win32' ? path.win32 : path.posix;
  const base = pathApi.join(home, '.cavemanizer');
  const schedules = pathApi.join(base, 'schedules');
  const logs = pathApi.join(base, 'logs');
  const scriptName = platform === 'win32' ? `${agent}-sync.cmd` : `${agent}-sync.sh`;

  return {
    base,
    schedules,
    logs,
    configPath: pathApi.join(schedules, `${agent}.json`),
    statePath: pathApi.join(schedules, `${agent}-state.json`),
    scriptPath: pathApi.join(schedules, scriptName),
    logPath: pathApi.join(logs, `${agent}-sync.log`),
    launchdPlistPath: pathApi.join(home, 'Library', 'LaunchAgents', `com.cavemanizer.${agent}.plist`),
    systemdServicePath: pathApi.join(home, '.config', 'systemd', 'user', `cavemanizer-${agent}.service`),
    systemdTimerPath: pathApi.join(home, '.config', 'systemd', 'user', `cavemanizer-${agent}.timer`),
    windowsTaskXmlPath: pathApi.join(schedules, `${agent}-sync.xml`)
  };
}

function scriptContent({ agent, home, nodePath = process.execPath, cliPath, paths, platform }) {
  const resolvedCliPath = cliPath ?? path.resolve(process.argv[1] ?? 'bin/cavemanizer.js');
  if (platform === 'win32') {
    const envPath = path.win32.join(home, '.cavemanizer', 'env.cmd');
    return `@echo off\r\nif exist "${envPath}" call "${envPath}"\r\n"${nodePath}" "${resolvedCliPath}" schedule run-due --agent ${agent}\r\n`;
  }

  const envPath = path.posix.join(home, '.cavemanizer', 'env');
  return `#!/bin/sh
set -eu
mkdir -p "${paths.logs}"
if [ -f "${envPath}" ]; then
  . "${envPath}"
fi
exec "${nodePath}" "${resolvedCliPath}" schedule run-due --agent ${agent}
`;
}

function launchdPlist({ agent, paths, schedule }) {
  const { minute, hour } = parseDailyCron(schedule.cron);
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.cavemanizer.${xml(agent)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/sh</string>
    <string>${xml(paths.scriptPath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key>
    <integer>${hour}</integer>
    <key>Minute</key>
    <integer>${minute}</integer>
  </dict>
  <key>StandardOutPath</key>
  <string>${xml(paths.logPath)}</string>
  <key>StandardErrorPath</key>
  <string>${xml(paths.logPath)}</string>
</dict>
</plist>
`;
}

function systemdService({ agent, paths }) {
  return `[Unit]
Description=Cavemanizer ${agent} skill sync

[Service]
Type=oneshot
ExecStart=/bin/sh ${systemdEscape(paths.scriptPath)}
`;
}

function systemdTimer({ agent, schedule }) {
  const { minute, hour } = parseDailyCron(schedule.cron);
  return `[Unit]
Description=Cavemanizer ${agent} skill sync timer

[Timer]
OnCalendar=*-*-* ${pad(hour)}:${pad(minute)}:00
Persistent=true
Unit=cavemanizer-${agent}.service

[Install]
WantedBy=timers.target
`;
}

function windowsTaskXml({ agent, paths, schedule }) {
  const { minute, hour } = parseDailyCron(schedule.cron);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
  <RegistrationInfo>
    <Description>Cavemanizer ${xml(agent)} skill sync</Description>
  </RegistrationInfo>
  <Triggers>
    <CalendarTrigger>
      <StartBoundary>2026-01-01T${pad(hour)}:${pad(minute)}:00</StartBoundary>
      <Enabled>true</Enabled>
      <ScheduleByDay>
        <DaysInterval>1</DaysInterval>
      </ScheduleByDay>
    </CalendarTrigger>
  </Triggers>
  <Settings>
    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
    <StartWhenAvailable>true</StartWhenAvailable>
    <Enabled>true</Enabled>
    <ExecutionTimeLimit>PT1H</ExecutionTimeLimit>
  </Settings>
  <Actions Context="Author">
    <Exec>
      <Command>${xml(paths.scriptPath)}</Command>
    </Exec>
  </Actions>
</Task>
`;
}

function cronBlock({ agent, paths, schedule }) {
  return `${cronMarker(agent).begin}
${schedule.cron} ${shellQuote(paths.scriptPath)} >> ${shellQuote(paths.logPath)} 2>&1
@reboot ${shellQuote(paths.scriptPath)} >> ${shellQuote(paths.logPath)} 2>&1
${cronMarker(agent).end}
`;
}

function cronMarker(agent) {
  return {
    begin: `# cavemanizer:begin ${agent}`,
    end: `# cavemanizer:end ${agent}`
  };
}

async function installCronBlock(agent, block) {
  const current = await currentCrontab();
  await runCommand({ command: 'crontab', args: ['-'], input: replaceCronBlock(current, agent, block) });
}

async function removeCronBlock(agent) {
  const current = await currentCrontab();
  await runCommand({ command: 'crontab', args: ['-'], input: replaceCronBlock(current, agent, '') });
}

async function currentCrontab() {
  const result = await captureCommand({ command: 'crontab', args: ['-l'], optional: true });
  return result.ok ? result.stdout : '';
}

function replaceCronBlock(current, agent, block) {
  const marker = cronMarker(agent);
  const escapedBegin = escapeRegExp(marker.begin);
  const escapedEnd = escapeRegExp(marker.end);
  const withoutBlock = current.replace(new RegExp(`\\n?${escapedBegin}[\\s\\S]*?${escapedEnd}\\n?`, 'g'), '\n').trim();
  return `${withoutBlock ? `${withoutBlock}\n\n` : ''}${block}`.trimEnd() + '\n';
}

function validateDailyCron(cron) {
  parseDailyCron(cron);
}

function parseDailyCron(cron) {
  const parts = String(cron).trim().split(/\s+/);
  if (parts.length !== 5) throw new Error(`Unsupported cron schedule: ${cron}`);
  const [minuteRaw, hourRaw, day, month, weekday] = parts;
  if (day !== '*' || month !== '*' || weekday !== '*') {
    throw new Error(`Only daily cron schedules are supported for now: ${cron}`);
  }
  const minute = parseNumber(minuteRaw, 0, 59, 'minute', cron);
  const hour = parseNumber(hourRaw, 0, 23, 'hour', cron);
  return { minute, hour };
}

function parseNumber(value, min, max, label, cron) {
  if (!/^\d+$/.test(value)) throw new Error(`Cron ${label} must be a number in schedule: ${cron}`);
  const parsed = Number(value);
  if (parsed < min || parsed > max) throw new Error(`Cron ${label} out of range in schedule: ${cron}`);
  return parsed;
}

function lastScheduledOccurrence(cron, now) {
  const { minute, hour } = parseDailyCron(cron);
  const scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0, 0);
  if (scheduled > now) scheduled.setDate(scheduled.getDate() - 1);
  return scheduled;
}

async function writeState(statePath, state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

async function runCommand({ command, args = [], input, optional = false }) {
  const result = await captureCommand({ command, args, input, optional });
  if (!result.ok && !optional) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function captureCommand({ command, args = [], input, optional = false }) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', (error) => {
      if (optional) resolve({ ok: false, code: null, stdout, stderr: error.message });
      else reject(error);
    });
    child.on('close', (code) => {
      resolve({ ok: code === 0, code, stdout, stderr });
    });
    if (input) child.stdin.end(input);
    else child.stdin.end();
  });
}

function windowsTaskName(agent) {
  return `Cavemanizer ${agent} sync`;
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function systemdEscape(value) {
  return String(value).replace(/ /g, '\\x20');
}

function xml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
