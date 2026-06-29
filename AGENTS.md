# AGENTS.md

This is the generated public CrowNest clients repository. It contains installable clients, public contracts, examples, and tests. It does not contain the hosted service implementation.

## Work here

- Package manager: pnpm.
- Verify command: pnpm verify.
- Packages: contracts, sdk, ai-sdk, cli, mcp, and python-sdk.
- API contract: https://api.crownest.dev/openapi.json.
- API catalog: https://api.crownest.dev/.well-known/api-catalog.
- Agent auth: https://api.crownest.dev/auth.md.
- Docs: https://docs.crownest.dev/docs.

## Rules

- Do not add service internals, deployment config, provider credentials, or dashboard-only code here.
- Do not put raw CrowNest API keys, bearer tokens, or customer data in tests, examples, commits, or fixtures.
- Prefer non-interactive commands and JSON output when scripting the CLI.
- Update examples when public SDK, CLI, MCP, or contract behavior changes.
