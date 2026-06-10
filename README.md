# cavemanizer

LLM-backed compressor for agent skills and always-loaded context.

`cavemanizer` turns verbose skill/rule/memory files into smaller machine-facing
variants while preserving behavior. It can run as:

- an installable agent skill, using your existing agentic CLI subscription;
- a local CLI compressor, using OpenAI/OpenRouter API keys;
- a fixture-based test/check tool for committed examples and CI.

The main workflow is:

1. Keep writing normal human-readable skills in the usual agent skill directory.
2. Run `cavemanizer sync` to generate compact copies into a shadow directory.
3. Use `cavemanizer sync --check` in CI or before deploy to catch stale generated
   skills.
4. Run `cavemanizer activate` or `sync --activate` to make the agent load the
   compact versions by the same skill names.

## Why

Agent skills and rules are often loaded repeatedly. If those files are verbose,
they consume context before the current task starts. Compressing reusable
instructions is lower-friction than forcing every human-facing answer into a
terse style: conversation style and reusable-instruction compression are separate
knobs.

## Install Skills Locally

Preview:

```bash
node bin/cavemanizer.js install --dry-run --agent codex
```

Install:

```bash
node bin/cavemanizer.js install --agent codex
```

Supported install targets in v1:

- `codex` -> `~/.codex/skills`
- `claude` -> `~/.claude/skills`
- `generic` -> `~/.local/share/cavemanizer/skills`

The installer copies `skills/cavemanizer/SKILL.md`.

Install, generate compact copies, and immediately activate them:

```bash
OPENAI_API_KEY=... ./install.sh --agent claude --sync --activate --provider openai --budget 800
```

The sync step writes generated skills to a shadow root by default:

```text
~/.cavemanizer/<agent>/skills
```

During sync, Cavemanizer does not overwrite the readable source skills in
`~/.claude/skills` or `~/.codex/skills`. During activation, it replaces each
live `SKILL.md` with the compact generated version and stores the original under
`~/.cavemanizer/<agent>/backups`.

## Skill Sync

Sync installed Claude skills into compact generated copies:

```bash
OPENAI_API_KEY=... node bin/cavemanizer.js sync \
  --agent claude \
  --provider openai \
  --budget 800
```

Check whether generated copies are current:

```bash
OPENAI_API_KEY=... node bin/cavemanizer.js sync \
  --agent claude \
  --provider openai \
  --budget 800 \
  --check
```

`sync` tracks source digests in `.cavemanizer-manifest.json`.

- New source skill: generate `<shadow-root>/<skill-id>/SKILL.md`.
- Changed source skill: regenerate it.
- Removed source skill: remove the generated copy.
- Unchanged source skill: skip it.

`preprocess` is an alias for `sync`.

Generate and activate in one step:

```bash
OPENAI_API_KEY=... node bin/cavemanizer.js sync \
  --agent claude \
  --provider openai \
  --budget 800 \
  --activate
```

`sync` also prints aggregate estimated-token savings:

```text
claude sync -> ~/.cavemanizer/claude/skills
  generate brainstorming
  skip gsd-debug
  saved 8762 est tokens (13871 -> 5109, 63.2% bytes)
```

Generated skill layout:

```text
~/.cavemanizer/claude/skills/
  .cavemanizer-manifest.json
  brainstorming/
    SKILL.md
    ir.json
    report.json
```

`SKILL.md` is the compact file. `ir.json` and `report.json` are for review,
debugging, and CI checks.

## Calling Activated Skills

After activation, you call skills exactly the same way as before. The skill id
and directory name do not change. For example, if Claude Code previously loaded:

```text
~/.claude/skills/brainstorming/SKILL.md
```

then activation replaces that file with the compact generated version. Claude
Code still sees the same `brainstorming` skill, but the loaded content is smaller.

Activation records a manifest:

```text
~/.cavemanizer/<agent>/activation-manifest.json
```

Restore originals:

```bash
node bin/cavemanizer.js restore --agent claude
```

Future `sync` runs detect activated skills and use the backed-up original as the
source, so the compact active file does not get repeatedly recompressed.

## Already Compact Skills

Skill creators can opt out of recompression by marking a skill as already compact:

```yaml
---
name: my-skill
description: Dense machine-facing skill.
cavemanizer: compact
---
```

Supported markers:

- `cavemanizer: compact`
- `cavemanizer: skip`
- `cavemanized: true`
- `<!-- cavemanizer: compact -->`

Cavemanizer adopts those skills as-is into the generated tree and records zero
compression savings. This is useful for skill authors who already ship a
machine-facing `SKILL.md`.

For a skill repo, a simple release flow is:

```bash
node bin/cavemanizer.js sync --agent claude --provider openai --budget 800
node bin/cavemanizer.js sync --agent claude --provider openai --budget 800 --check
```

Use `--check` in CI or a predeploy hook so generated compact skills cannot drift
from their readable source.

## CLI Compression

Fixture provider, deterministic and API-free:

```bash
npm run generate:examples
npm run check
```

OpenAI:

```bash
OPENAI_API_KEY=... node bin/cavemanizer.js compress skills \
  --out-dir dist/openai \
  --provider openai \
  --mode caveman
```

OpenRouter:

```bash
OPENROUTER_API_KEY=... node bin/cavemanizer.js compress skills \
  --out-dir dist/openrouter \
  --provider openrouter \
  --mode caveman
```

Outputs:

- `cavemanized.md`
- `ir.json`
- `report.json`

The validator preserves frontmatter, code blocks, inline code, URLs, paths, env
vars, and common plain shell commands such as `npm test -- --runInBand`,
`git status --short`, and `node bin/cavemanizer.js sync --agent claude --check`.

## Fixture Pack

`examples/fixtures` is the generic test corpus:

- `simple-workflow`: baseline workflow compression.
- `hard-gate`: approval gates and `MUST NOT` preservation.
- `protected-content`: commands, URLs, env vars, paths, and code blocks.
- `examples-heavy`: many examples collapsed into compact format guidance.
- `cross-file`: references to extra files and relative paths.

Generated outputs live in `examples/generated`.

## Real-World Evals

List local Codex/Claude skills:

```bash
node bin/cavemanizer.js list-real-skills
```

For Caveman-backed comparisons, install/load the actual Caveman skill first and
run the comparison in an agent session that explicitly uses it. See
[docs/real-world-evals.md](docs/real-world-evals.md).

Upstream Caveman is not vendored or rewritten here. Use it directly when you want
Caveman-mode communication or an external Caveman-backed compression comparison.

## Development

```bash
npm test
npm run generate:examples
npm run check
```

The fixture provider keeps tests deterministic. Real LLM providers are available
for manual and CI jobs with API keys.
