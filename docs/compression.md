# Compression Tactics

Cavemanizer uses an Instruction-IR step before rendering compact Markdown.

## Protected Islands

Some content should be copied exactly:

- frontmatter
- code blocks
- inline code
- commands and flags
- URLs
- paths
- env vars
- JSON/YAML snippets
- exact errors

The validator reports missing protected content after rendering. Commands are
protected whether they appear in code fences, inline code, or common plain prose
forms such as `npm test -- --runInBand` and `git status --short`.

## Creator Compact Marker

If a skill is already written in compact machine-facing form, mark it so
Cavemanizer adopts it without recompression:

```bash
node bin/cavemanizer.js mark-compact path/to/SKILL.md
```

To remove that marker:

```bash
node bin/cavemanizer.js unmark-compact path/to/SKILL.md
```

The command writes this metadata:

```yaml
cavemanizer: compact
```

Accepted markers:

- `cavemanizer: compact`
- `cavemanizer: skip`
- `cavemanized: true`
- `<!-- cavemanizer: compact -->`

## Priority Extraction

Verbose skills mix hard rules, rationale, examples, and flavor text. Compression
first separates:

- triggers
- `MUST` / `NEVER` rules
- approval gates
- ordered workflow
- examples that define behavior
- references/resources

Low-priority explanation can be removed only after high-priority behavior is
preserved.

## Workflow Compaction

Narrative workflow prose becomes numbered imperative steps.

## Deduplication

Repeated warnings collapse into one canonical rule. The output should not weaken
meaning, but it should avoid saying the same thing three ways.

## Example Diet

Examples are expensive. Keep one canonical example or one schema when examples
define output format. Delete decorative or repetitive examples.

## Rationale Removal

Remove "why this matters" text unless it changes execution. The compressed file
is for an agent already executing the skill, not a tutorial.

## Trigger Compression

Long "when to use" sections become compact trigger lists.

## Validation

Generated outputs should be checked for:

- protected content preserved
- hard rules still present
- output smaller than source where possible
- warnings surfaced instead of hidden
