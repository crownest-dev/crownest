# CrowNest public client examples

These examples show the shortest agent-operable paths in this public clients repository.

## CLI

```bash
export CROWNEST_BEARER_TOKEN=cn_agent_or_cn_live_...
crownest sandboxes create --json
crownest commands run sbx_... --json -- python --version
crownest artifacts list sbx_... --json
```

## TypeScript SDK

```ts
import { createCrowNestClient } from "@crownest/sdk";

const client = createCrowNestClient({
  credential: process.env.CROWNEST_BEARER_TOKEN,
});

const sandbox = await client.sandboxes.create();
await client.commands.run(sandbox.id, {
  command: "python --version",
  idempotencyKey: "example-python-version",
});
```

## MCP

```json
{
  "mcpServers": {
    "crownest": {
      "command": "npx",
      "args": ["-y", "@crownest/mcp"],
      "env": {
        "CROWNEST_BEARER_TOKEN": "cn_agent_or_cn_live_..."
      }
    }
  }
}
```

Discovery starts at https://api.crownest.dev/.well-known/api-catalog.
