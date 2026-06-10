# Real-World Evals

Synthetic fixtures are useful for regression tests, but Cavemanizer should also
be tested against real skills that agents actually load.

Do not commit copied third-party skills by default. Use `.real-skills/`, which is
ignored by git.

## 1. List Local Skills

```bash
node bin/cavemanizer.js list-real-skills
```

Output columns:

```text
agent    skill-id    caveman-marker    path
```

Current useful candidate categories:

- Codex process skills: `brainstorming`, `test-driven-development`,
  `systematic-debugging`, `writing-plans`, `verification-before-completion`.
- Claude/GSD workflow skills: `gsd-debug`, `gsd-plan-phase`,
  `gsd-execute-phase`, `gsd-code-review`, `gsd-sync-skills`.
- Any installed Caveman skill. It should appear with the `caveman` marker.

## 2. Install Or Load Caveman

For comparisons that claim to use Caveman, load the actual Caveman skill. Do not
imitate Caveman from memory.

One installer path from upstream Caveman:

```bash
curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash
```

Then verify:

```bash
node bin/cavemanizer.js list-real-skills | grep caveman
```

If no Caveman skill is found, install it or provide the path before running a
Caveman-backed comparison.

## 3. Copy Selected Real Skills Into Ignored Workspace

Example:

```bash
mkdir -p .real-skills/brainstorming
cp ~/.codex/skills/brainstorming/SKILL.md .real-skills/brainstorming/SKILL.md
```

Repeat for a small representative set. Start with 3 to 5 skills:

- one short skill
- one hard-gate/process skill
- one example-heavy skill
- one skill with references/resources
- the Caveman skill itself, if installed and license/usage permits local eval

## 4. Run Cavemanizer CLI

```bash
node bin/cavemanizer.js compress .real-skills \
  --out-dir .real-skills/generated \
  --provider openai \
  --mode caveman \
  --budget 800
```

Use `--provider openrouter` if testing a model matrix.

## 5. Run Agent-Loaded Caveman Comparison

Open the target agent CLI with Caveman installed. Explicitly invoke or load
Caveman first, then ask it to compress the same real skill. Example prompt:

```text
Use the installed Caveman skill. Read .real-skills/brainstorming/SKILL.md.
Compress it as a machine-facing agent skill.
Preserve frontmatter, code blocks, inline code, commands, paths, URLs, env vars,
MUST/NEVER rules, and approval gates exactly.
Write the result to .real-skills/generated/brainstorming/caveman-agent.md.
```

This keeps the comparison honest: the agent is using the actual Caveman skill,
not a hand-waved summary of it.

## 6. Compare

Compare three variants:

1. source `SKILL.md`
2. `cavemanized.md`
3. `caveman-agent.md` from the agent session that loaded Caveman

Check:

- token/byte savings
- frontmatter exactness
- protected content exactness
- hard rules preserved
- workflow still executable
- readability for future maintainers

Use this command for the generated Cavemanizer outputs:

```bash
node bin/cavemanizer.js check .real-skills \
  --out-dir .real-skills/generated \
  --provider openai \
  --mode caveman \
  --budget 800
```

For the agent-generated Caveman output, manually inspect or add it as a temporary
fixture before promotion.

## Local Smoke Result

On 2026-06-09, a local ignored smoke run used:

- upstream Caveman cloned to `.real-skills/upstream-caveman`
- `.real-skills/upstream-caveman/skills/caveman/SKILL.md`
- `~/.codex/skills/systematic-debugging/SKILL.md`
- `~/.codex/skills/using-superpowers/SKILL.md`

Command:

```bash
node bin/cavemanizer.js compress .real-skills/eval-input \
  --out-dir .real-skills/eval-output \
  --provider fixture \
  --mode caveman \
  --budget 800
```

Result:

| Skill | Source est tokens | Cavemanized | Saved |
|---|---:|---:|---:|
| `caveman-upstream` | 945 | 281 | 71.4% |
| `systematic-debugging` | 2465 | 544 | 78.0% |
| `using-superpowers` | 1352 | 545 | 59.8% |

`node bin/cavemanizer.js check .real-skills/eval-input --out-dir .real-skills/eval-output --provider fixture --mode caveman --budget 800`
reported generated outputs current.

This smoke run uses actual real-world skill files, including Caveman's own skill
source, but it is not the same as an agent session that has Caveman installed and
activated. Keep both comparisons separate.

## Session Bundle Smoke Result

Also on 2026-06-09, two ignored bundles were built from locally installed skills
to estimate savings for realistic agent sessions.

Superpowers bundle:

- `using-superpowers`
- `brainstorming`
- `writing-plans`
- `executing-plans`
- `finishing-a-development-branch`
- `test-driven-development`
- `systematic-debugging`
- `verification-before-completion`

GSD bundle:

- `gsd-do`
- `gsd-fast`
- `gsd-next`
- `gsd-plan-phase`
- `gsd-execute-phase`
- `gsd-debug`
- `gsd-code-review`
- `gsd-review`
- `gsd-ship`
- `gsd-sync-skills`

Commands:

```bash
node bin/cavemanizer.js compress .real-skills/session-input/superpowers \
  --out-dir .real-skills/session-output/superpowers \
  --provider fixture \
  --mode caveman \
  --budget 800

node bin/cavemanizer.js compress .real-skills/session-input/gsd \
  --out-dir .real-skills/session-output/gsd \
  --provider fixture \
  --mode caveman \
  --budget 800
```

Aggregate result:

| Bundle | Skills | Source est tokens | Cavemanized | Saved | Warnings |
|---|---:|---:|---:|---:|---:|
| Superpowers session | 8 | 13,871 | 5,109 | 63.2% | 0 |
| GSD session | 10 | 5,746 | 3,196 | 44.1% | 0 |

Verification:

```bash
node bin/cavemanizer.js check .real-skills/session-input/superpowers \
  --out-dir .real-skills/session-output/superpowers \
  --provider fixture \
  --mode caveman \
  --budget 800

node bin/cavemanizer.js check .real-skills/session-input/gsd \
  --out-dir .real-skills/session-output/gsd \
  --provider fixture \
  --mode caveman \
  --budget 800
```

Both checks reported generated outputs current.

## Mixed Top-10 Real Skill Result

On 2026-06-09, a mixed top-10 set was built from frequently used local workflow
skills plus representative public skills from high-star GitHub skill repos:

- local Superpowers process skills
- local GSD workflow skills
- `microsoft/SkillOpt`
- `FrancyJGLisboa/agent-skill-creator`
- `bergside/awesome-design-skills`
- `arpitg1304/robotics-agent-skills`

Command:

```bash
node bin/cavemanizer.js compress .real-skills/top10-input \
  --out-dir .real-skills/top10-output \
  --provider fixture \
  --mode caveman \
  --budget 800
```

Result, ranked by byte savings:

| Rank | Skill | Source est tokens | Cavemanized | Saved | Warnings |
|---:|---|---:|---:|---:|---:|
| 1 | `superpowers-systematic-debugging` | 2,465 | 544 | 78.0% | 0 |
| 2 | `superpowers-brainstorming` | 2,650 | 766 | 71.2% | 0 |
| 3 | `superpowers-test-driven-development` | 2,465 | 856 | 65.3% | 0 |
| 4 | `superpowers-using-superpowers` | 1,352 | 545 | 59.8% | 0 |
| 5 | `github-agent-skill-creator` | 9,853 | 4,106 | 57.8% | 0 |
| 6 | `gsd-debug` | 2,351 | 1,061 | 53.9% | 0 |
| 7 | `github-design-codex` | 1,013 | 483 | 52.3% | 0 |
| 8 | `gsd-execute-phase` | 748 | 398 | 46.8% | 0 |
| 9 | `github-skillopt-sleep` | 1,182 | 694 | 41.6% | 0 |
| 10 | `github-robotics-ros2` | 7,700 | 7,262 | 5.6% | 0 |

Aggregate:

| Set | Skills | Source est tokens | Cavemanized | Byte-weighted saved | Unweighted average saved | Warnings |
|---|---:|---:|---:|---:|---:|---:|
| Mixed top-10 | 10 | 31,779 | 16,715 | 46.9% | 53.2% | 0 |

The ROS2 skill is an important outlier: it is already dense and reference-heavy,
so the fixture compressor mostly preserves it. Prose-heavy process skills
compress much more aggressively. The estimated token count is the repository's
current lightweight heuristic, not provider tokenizer output.

## Claude Code Preprocess/Sync Flow

Cavemanizer uses a generated shadow skill root, not an in-place rewrite of the
user's installed skills.

Generate compact copies of installed Claude skills:

```bash
node bin/cavemanizer.js sync --agent claude \
  --home "$HOME" \
  --out-dir "$HOME/.cavemanizer/claude/skills" \
  --provider openai \
  --budget 800
```

`preprocess` is an alias for `sync`.

Behavior:

- discover installed Claude skills from the user's skill roots
- compress each `SKILL.md` into a generated directory with the same skill id and
  a generated `SKILL.md`
- write a manifest that records source path, output path, digest, provider, and
  compression settings
- skip unchanged source skills
- regenerate changed source skills
- remove generated skills whose source skill was removed
- never overwrite the original skill during sync
- optionally activate generated skills by replacing live `SKILL.md` files after
  backing up originals under `.cavemanizer/<agent>/backups`
- provide `--check` for CI or predeploy hooks to fail on stale generated skills
- print aggregate estimated-token savings for generated, updated, skipped, and
  checked skills when counts are available

This lets users keep writing and updating normal human-readable skills while the
agent loads a generated compact version when desired.

Activate after sync:

```bash
node bin/cavemanizer.js activate --agent claude
```

Or sync and activate in one command:

```bash
node bin/cavemanizer.js sync --agent claude --provider openai --budget 800 --activate
```

Restore readable originals:

```bash
node bin/cavemanizer.js restore --agent claude
```
