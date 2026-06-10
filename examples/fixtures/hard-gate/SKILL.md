---
name: hard-gate
description: Use this skill when a task has an explicit approval gate.
---

# Hard Gate

Use this skill when implementation must stop until a user approves a design,
plan, or risky operation.

You MUST present the design before writing production code. You MUST NOT edit
files before the user approves the design. If the user rejects the design, revise
the design and ask again. If the request involves deleting files, you MUST ask
for explicit confirmation before running `rm`.

First, restate the goal. Second, present the proposed design. Third, wait for
approval. Fourth, execute only the approved work. Fifth, verify and report the
result.
