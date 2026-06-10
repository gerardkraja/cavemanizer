---
name: cross-file
description: Use this skill when a skill references extra files.
---

# Cross File

Use this skill when the main instruction file depends on local references or
templates. The compressor must preserve resource paths so the agent can still
load the right files later.

You MUST preserve `references/checklist.md`, `scripts/verify.js`, and
`assets/template.md`. You MUST read referenced files only when needed; do not
bulk-load unrelated resources.

First, identify relative references. Second, keep the references exact. Third,
summarize when each referenced file should be opened.
