# cavemanizer

Keep skills readable for people, compact for the model.

`cavemanizer` shrinks agent skills and other always-loaded instruction files into
compact machine-facing versions. The readable skill stays readable. The agent
loads the smaller copy.

It exists because Caveman-style compression is useful, but using it for every
human conversation is a tradeoff. Many developers do not want to read and write
compressed prose all day. Skills are different: they are instructions for the
model, loaded repeatedly in the background. If a workflow uses several skills per
session, every extra paragraph in those files is context spent before the task
even starts.

So Cavemanizer applies the idea where it is least intrusive: reusable
computer-readable instructions. Human-facing docs remain clear. Machine-facing
skill files get lean.

## Token Savings

Local smoke results on real skill sets:

| Session / set | Skills loaded | Normal est tokens | Cavemanized est tokens | Saved |
|---|---:|---:|---:|---:|
| Superpowers workflow session | 8 | 13,871 | 5,109 | 63.2% |
| GSD workflow session | 10 | 5,746 | 3,196 | 44.1% |
| Mixed workflow set, excluding ROS2 outlier | 9 | 24,079 | 9,453 | 60.7% |

For a Superpowers-heavy session, that is about 8.7k estimated tokens saved before
the actual work starts. For a GSD session, about 2.5k estimated tokens. The win
scales with the number and size of skills your agent loads.

These numbers use the repo's lightweight estimated-token heuristic, not provider
tokenizer output. Full notes and reproduction commands live in
[docs/real-world-evals.md](docs/real-world-evals.md).

## API Key Setup

For OpenAI-backed compression, set the key once:

```bash
mkdir -p ~/.cavemanizer
printf 'export OPENAI_API_KEY=...\n' > ~/.cavemanizer/env
chmod 600 ~/.cavemanizer/env
```

Cavemanizer loads `~/.cavemanizer/env` before commands that use providers. A
normal shell environment variable still wins, so temporary overrides work:

```bash
OPENAI_API_KEY=temporary-key node bin/cavemanizer.js sync --agent claude --provider openai
```

On Windows, use `%USERPROFILE%\.cavemanizer\env.cmd`:

```bat
set OPENAI_API_KEY=...
```

## What It Does

Cavemanizer gives skill-heavy agent workflows a source/generated split:

```text
human skill source        generated compact skill
~/.claude/skills/foo  ->  ~/.cavemanizer/claude/skills/foo
~/.codex/skills/foo   ->  ~/.cavemanizer/codex/skills/foo
```

It can then activate the compact copy under the original skill name, so the
agent calls the same skill as before:

```text
~/.claude/skills/brainstorming/SKILL.md
```

still loads as `brainstorming`, but the file is the compact generated version.
The readable original is backed up and can be restored.

Cavemanizer tracks source digests. When `sync` runs again, it:

- generates compact copies for new skills
- regenerates changed skills
- skips unchanged skills
- removes generated copies for deleted source skills
- reads the backup original when a skill is currently activated, avoiding
  repeated recompression of already compact output

This makes it suitable for a normal maintenance loop: run `sync` after installing
or editing skills, or wire `sync --check` into CI/predeploy so stale generated
skills are caught automatically.

## Understanding Compact Skills

The repo also ships `understanding-caveman`, a two-sentence helper skill for
agents that need a quick orientation before reading cavemanized instructions. It
does not teach compression; it only says that terse bullets, labels, flows, and
hard rules should be treated as normal skill instructions.

## Scheduled Sync

Manual sync is useful when you know something changed. Scheduled sync is for the
normal developer laptop case: skills get installed, edited, or removed over time,
and Cavemanizer keeps the compact copies fresh in the background.

Install a daily scheduled sync:

```bash
node bin/cavemanizer.js schedule install \
  --agent claude \
  --provider openai \
  --budget 800 \
  --activate
```

Default schedule:

```text
0 3 * * *
```

Custom cron-style time:

```bash
node bin/cavemanizer.js schedule install \
  --agent claude \
  --provider openai \
  --budget 800 \
  --activate \
  --cron "30 4 * * *"
```

The current scheduler supports daily cron entries in `minute hour * * *` form.
Broader cron expressions can be added once the platform backends are exercised
more heavily.

Cron syntax is the user-facing format, not the only backend. Cavemanizer uses the
native scheduler where possible:

| Platform | Backend | Missed laptop run behavior |
|---|---|---|
| macOS | `launchd` LaunchAgent | runs after wake for missed calendar jobs |
| Linux | user `systemd` timer | `Persistent=true` catches missed runs |
| Windows | Task Scheduler | `StartWhenAvailable` catches missed runs |
| fallback | cron | best effort; no reliable sleep catch-up |

Each scheduled trigger calls `schedule run-due`, which checks the last successful
sync timestamp before doing work. If the scheduler fires twice around wake/login,
Cavemanizer skips the duplicate run.

Scheduled POSIX runs source `~/.cavemanizer/env` before running. On Windows, use
`%USERPROFILE%\.cavemanizer\env.cmd` with `set OPENAI_API_KEY=...`.

The installer can set this up in one command:

```bash
./install.sh \
  --agent claude \
  --sync \
  --activate \
  --schedule \
  --provider openai \
  --budget 800
```

Schedule status and removal:

```bash
node bin/cavemanizer.js schedule status --agent claude
node bin/cavemanizer.js schedule uninstall --agent claude
```

Platform validation task: test the scheduler on a real macOS laptop sleep/wake
cycle, a Linux systemd user-session VM, a Windows VM with Task Scheduler, and a
cron-only fallback environment before calling the scheduled installer fully
portable.

## Skill Author Flow

Skill authors can ship compact skills directly. Mark a `SKILL.md` as already
compact:

```bash
node bin/cavemanizer.js mark-compact path/to/SKILL.md
```

That writes:

```yaml
cavemanizer: compact
```

When Cavemanizer sees the marker, it adopts the skill as-is instead of
compressing it again. This gives creators a way to publish a machine-facing
skill once, and lets users' automatic sync flows skip it.

Remove the marker:

```bash
node bin/cavemanizer.js unmark-compact path/to/SKILL.md
```

Accepted markers:

- `cavemanizer: compact`
- `cavemanizer: skip`
- `cavemanized: true`
- `<!-- cavemanizer: compact -->`

## Install

Install the bundled skills into Codex:

```bash
./install.sh --agent codex
```

Install into Claude, compress installed Claude skills, and activate the compact
versions:

```bash
./install.sh --agent claude --sync --activate --provider openai --budget 800
```

Supported local skill targets:

- `codex` -> `~/.codex/skills`
- `claude` -> `~/.claude/skills`

Bundled skills:

- `cavemanizer`: compresses readable skills into compact generated variants
- `understanding-caveman`: helps an agent read cavemanized instructions if it
  needs the reminder

## Sync Installed Skills

Generate compact copies without touching live skills:

```bash
node bin/cavemanizer.js sync \
  --agent claude \
  --provider openai \
  --budget 800
```

Default output:

```text
~/.cavemanizer/<agent>/skills
```

Check whether generated skills are current:

```bash
node bin/cavemanizer.js sync \
  --agent claude \
  --provider openai \
  --budget 800 \
  --check
```

Generate and activate in one step:

```bash
node bin/cavemanizer.js sync \
  --agent claude \
  --provider openai \
  --budget 800 \
  --activate
```

Restore readable originals:

```bash
node bin/cavemanizer.js restore --agent claude
```

## Stats

Show current savings and sync history:

```bash
node bin/cavemanizer.js stats --agent claude
```

Example:

```text
claude stats

Current compact skill set:
  skills: 12
  normal: 18,420 est tokens
  compact: 7,360 est tokens
  saved per full skill load: 11,060 est tokens (60.0% bytes)

History:
  successful syncs: 4
  first sync: 2026-06-17T03:00:00.000Z
  last sync: 2026-06-20T03:00:00.000Z
  covered time: 3d
  generated: 12
  updated: 3
  skipped: 21
  adopted creator-compact: 2
  removed: 1
  cumulative saved across sync snapshots: 42,400 est tokens
```

The current section is the practical number: how many estimated tokens are saved
when the agent loads the current compact skill set instead of the readable
sources. The history section is based on Cavemanizer sync events. It is not actual
LLM session usage, because agents do not report how many times they loaded each
skill.

## Manual Compression

Compress a skill or fixture directory:

```bash
node bin/cavemanizer.js compress skills \
  --out-dir dist/openai \
  --provider openai \
  --mode caveman
```

Deterministic fixture provider, useful for tests:

```bash
npm run generate:examples
npm run check
```

Outputs:

- `cavemanized.md`
- `ir.json`
- `report.json`

The compressor uses an Instruction-IR step before rendering compact Markdown. It
preserves frontmatter, code blocks, inline code, URLs, paths, env vars, common
commands, and hard `MUST` / `NEVER` rules where possible. See
[docs/compression.md](docs/compression.md).

## Upstream Caveman

Cavemanizer is inspired by the practical token-saving idea behind
[Caveman](https://github.com/JuliusBrussee/caveman), but it solves a narrower
problem.

Use Caveman when you want the agent's conversation style to be terse. Use
Cavemanizer when you want always-loaded skill files to be terse while normal
conversation stays normal.

This repo does not vendor upstream Caveman. For Caveman-mode communication or an
agent-session comparison, install the real skill:

```bash
curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash
```

## Commands

```text
cavemanizer

Commands:
  compress <file-or-fixtures-dir> --out-dir <dir> [--provider fixture|openai] [--mode caveman]
  check <file-or-fixtures-dir> --out-dir <dir> [--provider fixture|openai] [--mode caveman]
  install [repo-root] [--agent codex] [--agent claude] [--sync] [--activate] [--provider fixture|openai] [--dry-run]
  sync [--agent claude] [--out-dir <dir>] [--provider fixture|openai] [--activate] [--check] [--dry-run]
  stats [--agent claude] [--out-dir <dir>]
  activate [--agent claude] [--out-dir <dir>] [--dry-run]
  restore [--agent claude] [--dry-run]
  schedule install [--agent claude] [--provider fixture|openai] [--budget tokens] [--activate] [--every daily|--cron "0 3 * * *"] [--backend auto|launchd|systemd|schtasks|cron] [--dry-run]
  schedule status [--agent claude]
  schedule uninstall [--agent claude] [--backend auto|launchd|systemd|schtasks|cron] [--dry-run]
  schedule run-due [--agent claude]
  mark-compact <SKILL.md>
  unmark-compact <SKILL.md>
  list-real-skills [--home <path>]
```

## Development

```bash
npm test
npm run generate:examples
npm run check
```

See [docs/github-actions.md](docs/github-actions.md) for CI examples.
