---
name: protected-content
description: Use this skill when commands, paths, URLs, and code blocks must survive rewriting.
---

# Protected Content

Use this skill when a document contains exact syntax that must not be changed.
The compressor should keep the exact command `npm test -- --runInBand`, the env
var `OPENAI_API_KEY`, the path /Users/example/project/AGENTS.md, and the URL
https://example.com/protected-content.

You MUST preserve every code block byte-for-byte. You MUST NOT rewrite JSON
examples, shell flags, or exact file paths.

First, locate protected content. Second, rewrite only prose around it. Third,
compare protected content against the original.

```bash
export OPENAI_API_KEY=sk-test
npm test -- --runInBand
```

```json
{"path": "/tmp/cavemanizer", "ok": true}
```
