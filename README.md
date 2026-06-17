# cavemanizer

`cavemanizer` compresses agent skills and other always-loaded instruction files
into smaller machine-facing versions.

The goal is simple: keep writing normal readable skills, but let the agent load a
compact generated copy when that saves context. Human conversation can stay
normal. The compact style is mainly useful for reusable files the model reads
over and over.

## What It Does

- Installs the Cavemanizer skill into Codex or Claude skill directories.
- Scans installed skills and generates compact copies in a shadow directory.
- Activates compact copies under the same skill names, so agents call them
  automatically.
- Restores the original readable skills when you want to go back.
- Lets skill creators mark a `SKILL.md` as already compact so it is adopted
  without recompression.
- Provides deterministic fixture checks for tests and OpenAI-backed compression
  for real output.

## Quick Start

Install the skill:

```bash
./install.sh --agent codex
```

Install, compress installed Claude skills, and activate the compact versions:

```bash
OPENAI_API_KEY=... ./install.sh --agent claude --sync --activate --provider openai --budget 800
```

After activation, call skills exactly as before. If Claude Code previously loaded
`~/.claude/skills/brainstorming/SKILL.md`, it still loads `brainstorming`; the
file is just the compact generated version. Originals are backed up under:

```text
~/.cavemanizer/<agent>/backups
```

Restore originals:

```bash
node bin/cavemanizer.js restore --agent claude
```

## Skill Sync

Generate compact copies without touching live skills:

```bash
OPENAI_API_KEY=... node bin/cavemanizer.js sync \
  --agent claude \
  --provider openai \
  --budget 800
```

Default output:

```text
~/.cavemanizer/<agent>/skills
```

`sync` tracks source digests in `.cavemanizer-manifest.json`.

- New source skill: generate a compact copy.
- Changed source skill: regenerate it.
- Removed source skill: remove the generated copy.
- Unchanged source skill: skip it.
- Activated source skill: use the backed-up original as the source, so compact
  files do not get repeatedly recompressed.

Check for stale generated skills in CI or before deployment:

```bash
OPENAI_API_KEY=... node bin/cavemanizer.js sync \
  --agent claude \
  --provider openai \
  --budget 800 \
  --check
```

Generate and activate in one step:

```bash
OPENAI_API_KEY=... node bin/cavemanizer.js sync \
  --agent claude \
  --provider openai \
  --budget 800 \
  --activate
```

## Compact Markers

If a skill is already authored in compact machine-facing form, mark it:

```bash
node bin/cavemanizer.js mark-compact path/to/SKILL.md
```

Remove the marker:

```bash
node bin/cavemanizer.js unmark-compact path/to/SKILL.md
```

Marked skills are copied into the generated tree as-is and report zero
compression savings. This gives skill creators a low-friction way to publish
their own compact skills while still fitting the Cavemanizer sync flow.

Accepted metadata:

```yaml
cavemanizer: compact
```

Also accepted: `cavemanizer: skip`, `cavemanized: true`, and
`<!-- cavemanizer: compact -->`.

## Manual Compression

Compress a skill or fixture directory:

```bash
OPENAI_API_KEY=... node bin/cavemanizer.js compress skills \
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
tries to preserve frontmatter, code blocks, inline code, URLs, paths, env vars,
common commands, and hard `MUST` / `NEVER` rules. See
[docs/compression.md](docs/compression.md).

## Benchmarks

These are lightweight estimated-token counts from local real-skill smoke runs,
not provider tokenizer measurements.

| Set | Skills | Source est tokens | Compact est tokens | Saved |
|---|---:|---:|---:|---:|
| Superpowers session | 8 | 13,871 | 5,109 | 63.2% |
| GSD session | 10 | 5,746 | 3,196 | 44.1% |
| Mixed workflow set, excluding ROS2 outlier | 9 | 24,079 | 9,453 | 60.7% |

ROS2 was omitted from the headline mixed figure because it is dense,
reference-heavy, and very niche compared with typical workflow skills. The full
notes are in [docs/real-world-evals.md](docs/real-world-evals.md).

## Upstream Caveman

This repo does not vendor or rewrite upstream Caveman. Use the real Caveman skill
when you want Caveman-mode communication or an agent-session comparison:

```bash
curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash
```

Cavemanizer's everyday use case is narrower: compact files that are loaded by an
agent, not every sentence you write to the agent.

## Commands

```text
cavemanizer

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
```

## Development

```bash
npm test
npm run generate:examples
npm run check
```

See [docs/github-actions.md](docs/github-actions.md) for CI examples.
