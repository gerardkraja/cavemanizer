# Reddit Post Draft

Title:

```text
I built Cavemanizer, a small tool for compacting agent skills before they hit context
```

Post:

```text
I have been experimenting with CLI agent workflows, especially Codex/Claude-style
skills that get loaded repeatedly. The problem I kept running into is that useful
skills are often written for humans: clear, verbose, full of examples, and good
for maintenance. That is great when editing the skill, but wasteful when an LLM
has to read the same file on every relevant task.

So I built Cavemanizer:

https://github.com/gerardkraja/cavemanizer

It lets you keep normal readable skills as the source of truth, then generates
compact machine-facing copies for the agent to load. For Claude/Codex skills, the
flow is:

- install the Cavemanizer skill
- sync installed skills into ~/.cavemanizer/<agent>/skills
- optionally activate the compact copies under the same skill names
- restore the originals whenever needed

The project also has a CLI compressor, deterministic fixture tests, a GitHub
Actions check flow, and a compact marker for skill authors who already write a
machine-facing SKILL.md.

Local smoke numbers so far:

- Superpowers session: 13,871 -> 5,109 estimated tokens, 63.2% saved
- GSD session: 5,746 -> 3,196 estimated tokens, 44.1% saved
- Mixed workflow set excluding a dense ROS2 outlier: about 60.7% saved

The intended use is not "talk in Caveman style all day". I still prefer normal
human communication with the LLM. This is more about shrinking the reusable
instruction files the model reads in the background.

This is also part of my programming portfolio/resume work, so feedback on the
idea, the CLI flow, and the project shape would be useful.
```
