---
name: hard-gate
description: Use this skill when a task has an explicit approval gate.
---

# Hard Gate

Use: implementation must stop until a user approves a design, plan, or risky operation

Rules:
- MUST present the design before writing code
- MUST NOT edit files before user approval the design
- If the request involves deleting files, you MUST ask confirmation before `rm`

Flow: restate the goal -> present design -> wait for approval -> execute approved work -> verify /report
