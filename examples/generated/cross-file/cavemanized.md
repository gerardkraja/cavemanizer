---
name: cross-file
description: Use this skill when a skill references extra files.
---

# Cross File

Use: the main instruction file depends on local references or templates

Rules:
- The compressor must preserve resource paths so the agent can still load the right files later
- MUST preserve `references/checklist.md`, `scripts/verify.js`, and `assets/template.md`
- MUST read referenced files only when needed; do not bulk-load unrelated resources

Flow: identify relative references -> keep the references exact -> summarize when each referenced file should be opened
