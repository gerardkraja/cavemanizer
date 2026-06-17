# Real-World Evals

Synthetic fixtures catch regressions, but Cavemanizer should also be checked
against skills that agents actually load.

Do not commit copied third-party skills by default. Use `.real-skills/`, which is
ignored by git.

## Local Discovery

```bash
node bin/cavemanizer.js list-real-skills
```

Output columns:

```text
agent    skill-id    caveman-marker    path
```

Useful local sets:

- Superpowers process skills such as `brainstorming`,
  `test-driven-development`, `systematic-debugging`, `writing-plans`, and
  `verification-before-completion`.
- GSD workflow skills such as `gsd-debug`, `gsd-plan-phase`,
  `gsd-execute-phase`, `gsd-code-review`, and `gsd-sync-skills`.
- The upstream Caveman skill when comparing against an agent session that has
  Caveman installed.

## Running A Local Eval

Copy selected skills into an ignored input directory:

```bash
mkdir -p .real-skills/input/brainstorming
cp ~/.codex/skills/brainstorming/SKILL.md .real-skills/input/brainstorming/SKILL.md
```

Generate compact versions:

```bash
OPENAI_API_KEY=... node bin/cavemanizer.js compress .real-skills/input \
  --out-dir .real-skills/output \
  --provider openai \
  --mode caveman \
  --budget 800
```

Check generated outputs:

```bash
OPENAI_API_KEY=... node bin/cavemanizer.js check .real-skills/input \
  --out-dir .real-skills/output \
  --provider openai \
  --mode caveman \
  --budget 800
```

For installed skills, use the sync flow:

```bash
OPENAI_API_KEY=... node bin/cavemanizer.js sync \
  --agent claude \
  --provider openai \
  --budget 800 \
  --check
```

## Caveman Comparison

If a result claims to use Caveman, install or load the actual upstream Caveman
skill first:

```bash
curl -fsSL https://raw.githubusercontent.com/JuliusBrussee/caveman/main/install.sh | bash
```

Then run the comparison inside the target agent session and explicitly invoke the
installed Caveman skill. Keep this separate from Cavemanizer's CLI compression so
the comparison is honest.

## Smoke Results

These figures came from local ignored real-skill runs on 2026-06-09. They use the
repo's lightweight estimated-token heuristic, not a provider tokenizer.

| Set | Skills | Source est tokens | Compact est tokens | Saved | Warnings |
|---|---:|---:|---:|---:|---:|
| Superpowers session | 8 | 13,871 | 5,109 | 63.2% | 0 |
| GSD session | 10 | 5,746 | 3,196 | 44.1% | 0 |
| Mixed top-10, including ROS2 | 10 | 31,779 | 16,715 | 46.9% | 0 |
| Mixed workflow set, excluding ROS2 | 9 | 24,079 | 9,453 | 60.7% | 0 |

The mixed set combined local Superpowers/GSD skills with representative public
skills from high-star skill repos. The ROS2 robotics skill was retained in the
raw top-10 result, but it is a niche, dense, reference-heavy outlier. It compressed
only 5.6%, while prose-heavy workflow skills commonly compressed by 40-78%.

The headline expectation for normal workflow skills is roughly 45-65% estimated
token reduction, with larger savings on verbose process skills and smaller
savings on already dense technical references.
