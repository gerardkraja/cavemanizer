---
name: examples-heavy
description: Use this skill when a verbose document has too many examples.
---

# Examples Heavy

Use this skill when examples dominate a skill and most of them repeat the same
idea. The compressor should keep one canonical example or replace examples with a
schema.

You MUST keep examples that define a required output format. You SHOULD remove
decorative examples that do not add new behavior.

Example good commit: `feat(parser): add token budget`.
Example good commit: `fix(cli): preserve code blocks`.
Example good commit: `docs(readme): explain installer`.
Example bad commit: `updated stuff`.
Example bad commit: `changes`.

First, find examples that encode behavior. Second, collapse repeated examples.
Third, keep the shortest useful schema.
