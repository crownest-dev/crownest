# @crownest/mcp

`@crownest/mcp` is a stdio MCP server that lets MCP hosts use CrowNest Sandboxes as tools. It wraps the TypeScript SDK, creates Sandboxes on demand, runs Commands and Python code, reads and writes Workspace files under `/workspace`, and downloads Artifacts as base64 content.

The package is published as `@crownest/mcp`. Once maintainers publish a registry release, MCP hosts can run it with `npx @crownest/mcp`.

The hosted CrowNest service and runtime implementation are not part of this package.

Docs: https://crownest.dev/docs

License: Apache-2.0

## Host Configuration

Claude Code:

```bash
claude mcp add crownest -e CROWNEST_API_KEY=cn_live_... -- npx @crownest/mcp
```

Generic MCP configuration:

```json
{
  "mcpServers": {
    "crownest": {
      "command": "npx",
      "args": ["@crownest/mcp"],
      "env": {
        "CROWNEST_API_KEY": "cn_live_..."
      }
    }
  }
}
```

Set `CROWNEST_API_URL` only when targeting a non-production CrowNest API.

## Sandbox Lifecycle

The server lazily creates one default Sandbox on the first stateful tool call. Tools that operate inside a Sandbox return `sandbox_id`, and later calls can pass that `sandbox_id` to keep using the same Workspace. `create_sandbox` creates additional Sandboxes for the same server session, and `kill_sandbox` removes a server-created Sandbox. When stdio closes, the server best-effort kills Sandboxes it created.

`CROWNEST_API_KEY` is a host-process credential for the SDK. It is not passed into Sandbox runtime environment variables.

## Tools

| Tool                | Description                                                                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_code`          | Runs Python code in a Sandbox. Variables and imports persist across calls in the same Sandbox. Outputs are promoted to Artifacts when needed. |
| `run_command`       | Runs a Command in a Sandbox and returns exit code, stdout, stderr, and `sandbox_id`.                                                          |
| `create_sandbox`    | Creates a Sandbox for this MCP server session, optionally with `ttl_ms`.                                                                      |
| `kill_sandbox`      | Kills a server-created Sandbox. If it was the default Sandbox, the next default call creates a new one.                                       |
| `write_file`        | Writes utf-8 text to a Workspace path, normally under `/workspace`.                                                                           |
| `read_file`         | Reads utf-8 text from a Workspace path.                                                                                                       |
| `list_files`        | Lists files in a Workspace path, defaulting to `/workspace`.                                                                                  |
| `download_artifact` | Downloads an Artifact by id and returns base64 content plus content type.                                                                     |

## Local Development

```bash
pnpm --filter @crownest/mcp test
pnpm --filter @crownest/mcp typecheck
pnpm --filter @crownest/mcp build
CROWNEST_API_KEY= node packages/mcp/dist/index.js
```
