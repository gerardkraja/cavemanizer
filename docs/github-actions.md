# GitHub Actions

Use `cavemanizer check` to ensure generated compressed examples stay current.

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm test
      - run: npm run check
```

For real LLM-backed compression in CI, provide `OPENAI_API_KEY` or
`OPENROUTER_API_KEY` as a repository secret and run the CLI with the matching
provider. Keep generated outputs committed so diffs are reviewable.
