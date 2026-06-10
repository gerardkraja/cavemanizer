# Skill Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe sync/preprocess flow that cavemanizes installed agent skills into a generated shadow skill root and keeps that root current as source skills are added, changed, or removed.

**Architecture:** `src/realSkills.js` remains responsible for discovering local skill roots. A new `src/sync.js` module owns digest comparison, generated skill writes, manifest updates, stale generated directory cleanup, and check/dry-run behavior. `src/cli.js` exposes `sync` and `preprocess` aliases plus optional `install --sync` wiring.

**Tech Stack:** Node.js ESM, built-in `node:test`, built-in `fs/promises`, `crypto`, existing provider/compression modules.

---

### Task 1: Failing Tests

**Files:**
- Modify: `test/cli.test.js`
- Create: `test/sync.test.js`

- [x] Add a CLI regression test proving `check` rejects obsolete generated files.
- [x] Add sync tests proving:
  - a source skill is generated as `<out-dir>/<skill-id>/SKILL.md`
  - `.cavemanizer-manifest.json` records source digest and generated path
  - unchanged skills are skipped
  - removed source skills delete their generated skill directory
  - check mode reports stale/missing generated skills without writing
- [x] Run targeted tests and verify they fail for missing behavior.

### Task 2: Sync Module

**Files:**
- Create: `src/sync.js`
- Modify: `src/realSkills.js`

- [x] Add optional agent filtering to `discoverRealSkills`.
- [x] Implement `syncCavemanizedSkills(options)`.
- [x] Use `compressDocument` with existing providers.
- [x] Write generated `SKILL.md`, `ir.json`, and `report.json`.
- [x] Write `.cavemanizer-manifest.json`.
- [x] Remove generated directories for source skills no longer present.
- [x] Implement `check` and `dryRun` modes.

### Task 3: CLI And Installer Wiring

**Files:**
- Modify: `src/cli.js`
- Modify: `install.sh`
- Modify: `README.md`
- Modify: `docs/real-world-evals.md`

- [x] Add `sync` and `preprocess` commands.
- [x] Add `install --sync` that runs sync after skill installation.
- [x] Document shadow root behavior and production provider usage.
- [x] Keep generated sync output separate from original installed skills.

### Task 4: Review Fixes And Verification

**Files:**
- Modify: `src/compress.js`
- Modify: `docs/github-actions.md`

- [x] Make `check` fail on obsolete generated output files.
- [x] Remove accidental patch text from `docs/github-actions.md`.
- [x] Run `npm run check`.
- [x] Run `git diff --check`.
