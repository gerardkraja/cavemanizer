import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  isScheduleDue,
  planScheduleInstall,
  planScheduleUninstall,
  scheduleFromOptions
} from '../src/schedule.js';

const BASE_OPTIONS = {
  agent: 'claude',
  providerName: 'openai',
  model: 'gpt-5.2',
  budget: 800,
  activate: true,
  home: '/Users/dev',
  nodePath: '/usr/local/bin/node',
  cliPath: '/repo/bin/cavemanizer.js'
};

test('daily schedule is due after a missed scheduled run', () => {
  const cron = '0 3 * * *';

  assert.equal(
    isScheduleDue({
      cron,
      now: new Date(2026, 5, 17, 10, 0, 0),
      lastSuccessAt: new Date(2026, 5, 16, 3, 5, 0).toISOString()
    }),
    true
  );

  assert.equal(
    isScheduleDue({
      cron,
      now: new Date(2026, 5, 17, 10, 0, 0),
      lastSuccessAt: new Date(2026, 5, 17, 3, 5, 0).toISOString()
    }),
    false
  );
});

test('daily schedule looks back to yesterday before today scheduled time', () => {
  assert.equal(
    isScheduleDue({
      cron: '0 3 * * *',
      now: new Date(2026, 5, 17, 2, 0, 0),
      lastSuccessAt: new Date(2026, 5, 16, 3, 5, 0).toISOString()
    }),
    false
  );
});

test('scheduleFromOptions defaults to daily at 03:00', () => {
  assert.deepEqual(scheduleFromOptions({}), { cron: '0 3 * * *', intervalHours: 24 });
  assert.deepEqual(scheduleFromOptions({ every: 'daily' }), { cron: '0 3 * * *', intervalHours: 24 });
  assert.deepEqual(scheduleFromOptions({ cron: '30 4 * * *' }), { cron: '30 4 * * *', intervalHours: 24 });
});

test('macOS schedule plan uses launchd with wake catch-up semantics', () => {
  const plan = planScheduleInstall({ ...BASE_OPTIONS, platform: 'darwin' });

  assert.equal(plan.backend, 'launchd');
  assert.ok(plan.files.some((file) => file.path.endsWith('/Library/LaunchAgents/com.cavemanizer.claude.plist')));
  assert.ok(plan.files.some((file) => file.content.includes('schedule run-due --agent claude')));
  assert.match(plan.files.find((file) => file.path.endsWith('.plist')).content, /<key>StartCalendarInterval<\/key>/);
  assert.match(plan.files.find((file) => file.path.endsWith('.plist')).content, /<integer>3<\/integer>/);
  assert.ok(plan.commands.some((command) => command.args.includes('load')));
});

test('Linux schedule plan uses a persistent systemd user timer', () => {
  const plan = planScheduleInstall({ ...BASE_OPTIONS, platform: 'linux' });
  const timer = plan.files.find((file) => file.path.endsWith('.timer'));

  assert.equal(plan.backend, 'systemd');
  assert.match(timer.content, /OnCalendar=\*-\*-\* 03:00:00/);
  assert.match(timer.content, /Persistent=true/);
  assert.ok(plan.commands.some((command) => command.args.includes('enable') && command.args.includes('--now')));
});

test('Windows schedule plan uses Task Scheduler with missed-run catch-up', () => {
  const plan = planScheduleInstall({
    ...BASE_OPTIONS,
    platform: 'win32',
    home: 'C:\\Users\\dev',
    nodePath: 'C:\\Program Files\\nodejs\\node.exe',
    cliPath: 'C:\\repo\\bin\\cavemanizer.js'
  });
  const xml = plan.files.find((file) => file.path.endsWith('.xml'));

  assert.equal(plan.backend, 'schtasks');
  assert.match(xml.content, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
  assert.match(xml.content, /<Command>.*claude-sync\.cmd<\/Command>/);
  assert.ok(plan.commands.some((command) => command.command.toLowerCase().includes('schtasks')));
});

test('cron fallback installs a marker-managed block plus reboot catch-up', () => {
  const plan = planScheduleInstall({ ...BASE_OPTIONS, backend: 'cron', platform: 'linux' });

  assert.equal(plan.backend, 'cron');
  assert.match(plan.crontabBlock, /# cavemanizer:begin claude/);
  assert.match(plan.crontabBlock, /0 3 \* \* \*/);
  assert.match(plan.crontabBlock, /@reboot/);
});

test('schedule uninstall removes platform-specific owned files', () => {
  const mac = planScheduleUninstall({ agent: 'claude', home: '/Users/dev', platform: 'darwin' });
  const linux = planScheduleUninstall({ agent: 'claude', home: '/Users/dev', platform: 'linux' });
  const windows = planScheduleUninstall({ agent: 'claude', home: 'C:\\Users\\dev', platform: 'win32' });

  assert.ok(mac.filesToRemove.some((file) => file.endsWith('com.cavemanizer.claude.plist')));
  assert.ok(linux.filesToRemove.some((file) => file.endsWith('cavemanizer-claude.timer')));
  assert.ok(windows.filesToRemove.some((file) => file.endsWith('claude-sync.xml')));
});
