---
name: cavemanizer
description: Use when compressing agent skills, rules, or always-loaded instruction files into smaller machine-facing variants while preserving behavior.
cavemanizer: compact
---

# Cavemanizer

Use when asked to shrinkify, cavemanize, compact, minify, or compress an agent
skill, rule file, memory file, or reusable instruction file.

## Goal

Produce a smaller machine-facing document that an LLM can read instead of the
verbose original. Preserve behavior. Remove excess prose.

## Protected Content

Copy these exactly unless the user explicitly asks otherwise:

- YAML frontmatter.
- Code blocks.
- Inline code.
- Shell commands and flags.
- URLs.
- File paths.
- Env vars.
- JSON/YAML snippets.
- Exact error messages.
- `MUST`, `NEVER`, `REQUIRED`, and approval gates.

## Compression Flow

1. Read the full source before rewriting.
2. Extract Instruction-IR:
   - triggers
   - hard rules
   - ordered workflow
   - protected content
   - examples that encode behavior
   - references/resources
   - risky omissions
3. Remove rationale, repeated warnings, decorative examples, marketing copy, and
   long explanations that do not change behavior.
4. Render compact Markdown:
   - frontmatter first
   - short title
   - trigger list
   - rules list
   - workflow steps
   - protected content copied exactly
5. Validate:
   - frontmatter unchanged
   - all code blocks preserved
   - inline code/commands/paths/URLs/env vars preserved
   - hard rules not weakened
   - output is smaller than source unless preservation prevents it

## Output

When writing files, use:

- `cavemanized.md`
- `ir.json` when useful for review
- `report.json` when useful for checks

Report warnings instead of hiding uncertain compression.

## Already Compact Skills

If a skill is already authored in compact machine-facing form, mark it with:

```yaml
cavemanizer: compact
```

Cavemanizer should adopt it as-is instead of recompressing it.
