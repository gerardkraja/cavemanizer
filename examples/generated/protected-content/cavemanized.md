---
name: protected-content
description: Use this skill when commands, paths, URLs, and code blocks must survive rewriting.
---

# Protected Content

Use: a document contains exact syntax that must not be changed

Rules:
- MUST preserve every code block byte-for-byte
- MUST NOT rewrite JSON examples, shell flags, or exact file paths

Flow: locate protected content -> rewrite only prose around it -> compare protected content against the original

Keep: `npm test -- --runInBand`; `OPENAI_API_KEY`; https://example.com/protected-content; /Users/example/project/AGENTS.md

```bash
export OPENAI_API_KEY=sk-test
npm test -- --runInBand
```
```json
{"path": "/tmp/cavemanizer", "ok": true}
```
