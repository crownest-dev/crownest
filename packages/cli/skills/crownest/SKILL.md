---
name: crownest
description: Use when an agent needs CrowNest cloud Sandboxes to run code, execute shell Commands, manage /workspace files, export durable Artifacts, create authenticated Previews, inspect usage, or offload dependency-heavy work. Prefer configured CrowNest MCP tools when available; otherwise use the crownest CLI, TypeScript SDK, Python SDK, or Vercel AI SDK.
---

# CrowNest

Use CrowNest for live cloud Sandboxes. A Sandbox has a Workspace rooted at
`/workspace`; files there are ephemeral unless exported as Artifacts.

## Pick the Surface

1. Use CrowNest MCP tools when they are available in the host.
2. Use the `crownest` CLI when shell commands are available but MCP tools are not.
3. Use the TypeScript, Python, or Vercel AI SDK only when writing application code.

Read [references/capability-map.md](references/capability-map.md) when you need
to map an operation across MCP, CLI, and SDKs.

## Operating Rules

- Keep `CROWNEST_API_KEY` in the host process. Do not pass it into Sandbox runtime
  environment variables, write it to `/workspace`, or include it in Artifacts.
- Keep public file API paths under `/workspace`.
- Export important outputs with Artifacts before killing a Sandbox.
- Kill Sandboxes explicitly when work is complete. TTL expiry is only a backstop.
- For retry-sensitive mutations, use CLI or SDK idempotency options when MCP does
  not expose caller-provided idempotency keys.

## Common Workflows

For stateful Code Runs, create/run/collect/kill flows, retry patterns, and
cleanup examples, read [references/agent-patterns.md](references/agent-patterns.md).

## MCP Notes

- Omit `sandbox_id` to use the MCP session's lazy default Sandbox.
- Capture returned `sandbox_id` and `context_id` when you need explicit reuse.
- Use `get_usage` before long or expensive work.
- Use `create_artifact` for durable outputs.
- Use `kill_sandbox` for cleanup.

## CLI Notes

Use `crownest login` once, or set `CROWNEST_API_KEY` in the environment.

```bash
SANDBOX=$(crownest sandboxes create --template python-node --json | jq -r .data.id)
crownest commands run "$SANDBOX" -- python3 -c "print(40 + 2)"
crownest sandboxes kill "$SANDBOX"
```
