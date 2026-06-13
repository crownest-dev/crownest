# CrowNest

Official open-source clients for CrowNest: TypeScript SDK, Python SDK, CLI, MCP server, and public API contracts.

CrowNest provides cloud sandboxes for coding agents. Use Sandboxes for isolated execution, Commands for process invocations, Workspace files for live working state, Artifacts for durable outputs, and Previews for authenticated HTTP services.

The CrowNest hosted service and service implementation are not part of this repository.

## Packages

- `@crownest/sdk`: TypeScript SDK.
- `crownest`: Python SDK.
- `@crownest/cli`: command-line interface.
- `@crownest/mcp`: MCP stdio server.
- `@crownest/contracts`: low-level public TypeScript API contracts.

## Install

```bash
pnpm add @crownest/sdk
uv add crownest
npm install -g @crownest/cli
npx @crownest/mcp
```

Docs: https://crownest.dev/docs

License: Apache-2.0
