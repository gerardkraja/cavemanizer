# GitHub Actions

Use the deterministic fixture provider for repository checks:

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

For real installed skills, run `sync --check` with an LLM provider:

```yaml
- run: node bin/cavemanizer.js sync --agent claude --provider openai --budget 800 --check
  env:
    OPENAI_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

Keep generated outputs reviewable when a project chooses to commit them.
