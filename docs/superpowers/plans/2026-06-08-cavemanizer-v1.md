# Cavemanizer V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a small LLM-backed skill compressor with installable skills, deterministic fixtures, generated examples, tests, and CI scaffolding.

**Architecture:** The CLI extracts an Instruction-IR through a provider adapter, validates preserved content, then renders cavemanized Markdown. Real providers use OpenAI/OpenRouter; tests and committed examples use a deterministic fixture provider.

**Tech Stack:** Node.js ESM, built-in `node:test`, no runtime dependencies.

---

## File Structure

- `bin/cavemanizer.js`: executable CLI entrypoint.
- `src/cli.js`: argument parsing and command dispatch.
- `src/compress.js`: compression orchestration, writes outputs/reports.
- `src/ir.js`: protected-content extraction, fixture IR extraction, validation.
- `src/providers.js`: `fixture`, `openai`, and `openrouter` provider adapters.
- `src/renderers.js`: caveman Markdown renderer.
- `src/install.js`: local skill installer and dry-run planner.
- `skills/cavemanizer/SKILL.md`: full agent skill for shrinkifying skills.
- `examples/fixtures/*/SKILL.md`: generic fixture pack.
- `examples/generated/*`: committed outputs generated from fixture provider.
- `test/*.test.js`: unit and CLI tests.
- `docs/compression.md`: compression tactics.
- `docs/github-actions.md`: CI usage template.
- `.github/workflows/ci.yml`: test/check workflow.

## Tasks

### Task 1: Test Harness And Failing Tests

- [ ] Create `package.json` with scripts for `test`, `generate:examples`, and `check`.
- [ ] Write tests for protected content extraction and validation in `test/ir.test.js`.
- [ ] Write tests for compression output/report behavior in `test/compress.test.js`.
- [ ] Write tests for CLI check failure on stale generated output in `test/cli.test.js`.
- [ ] Write tests for installer dry-run and temp-home install in `test/install.test.js`.
- [ ] Run `npm test` and confirm tests fail because implementation modules are missing.

### Task 2: Core Implementation

- [ ] Implement `src/ir.js`, `src/renderers.js`, `src/providers.js`, and `src/compress.js`.
- [ ] Run focused tests and fix root causes until core tests pass.
- [ ] Implement `src/cli.js` and `bin/cavemanizer.js`.
- [ ] Run CLI tests and fix root causes until all tests pass.
- [ ] Implement `src/install.js`.
- [ ] Run installer tests and fix root causes until all tests pass.

### Task 3: Skills, Fixtures, Docs, CI

- [ ] Add `skills/cavemanizer/SKILL.md`.
- [ ] Add generic fixture skills covering simple workflow, hard gate, protected content, examples-heavy, and cross-file references.
- [ ] Add README, compression docs, GitHub Actions docs, install script, and CI workflow.
- [ ] Run `npm run generate:examples` to write committed cavemanized outputs.
- [ ] Run `npm run check` and `npm test`.
- [ ] Review `git diff` for generated artifacts, docs, and tests.
