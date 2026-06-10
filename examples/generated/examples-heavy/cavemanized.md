---
name: examples-heavy
description: Use this skill when a verbose document has too many examples.
---

# Examples Heavy

Use: examples dominate a skill and most of them repeat the same idea

Rules:
- MUST keep examples that define a required output format
- SHOULD remove decorative examples that do not add new behavior

Flow: find examples that encode behavior -> collapse repeated examples -> keep the shortest useful schema

Example: `feat(parser): add token budget`

Keep: `fix(cli): preserve code blocks`; `docs(readme): explain installer`; `updated stuff`; `changes`
