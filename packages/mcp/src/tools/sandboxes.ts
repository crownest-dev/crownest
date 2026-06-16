import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import { formatSandbox, formatSandboxList, jsonTextResult } from "../formatting";
import type { McpSession } from "../session";
import { handleTool, sandboxIdSchema, sandboxStatusSchema } from "./shared";

export function registerCreateSandbox(server: McpServer, session: McpSession): void {
  server.registerTool(
    "create_sandbox",
    {
      description:
        "Create an additional CrowNest Sandbox for this MCP server session without changing the lazy default Sandbox used when sandbox_id is omitted. The Sandbox has a Workspace at /workspace, is tracked until killed or MCP session exit cleanup runs, and can be reused by passing sandbox_id.",
      inputSchema: z.object({
        ttl_ms: z.number().int().positive().optional(),
      }),
    },
    (input) =>
      handleTool(async () => {
        const sandbox = await session.createSandbox(
          input.ttl_ms === undefined ? {} : { ttlMs: input.ttl_ms },
        );
        return jsonTextResult({
          expires_at: sandbox.expiresAt,
          sandbox_id: sandbox.id,
        });
      }),
  );
}

export function registerKillSandbox(server: McpServer, session: McpSession): void {
  server.registerTool(
    "kill_sandbox",
    {
      description:
        "Kill a CrowNest Sandbox created by this MCP server session. If it is the lazy default Sandbox, the next tool call that omits sandbox_id creates a new default Sandbox.",
      inputSchema: z.object({
        sandbox_id: sandboxIdSchema,
      }),
    },
    (input) =>
      handleTool(async () => {
        await session.killSandbox(input.sandbox_id as `sbx_${string}`);
        return jsonTextResult({ killed: true, sandbox_id: input.sandbox_id });
      }),
  );
}

export function registerListSandboxes(server: McpServer, session: McpSession): void {
  server.registerTool(
    "list_sandboxes",
    {
      description:
        "List live CrowNest Sandboxes visible to the configured API Key. This is account-visible discovery, not just the MCP session cache; use get_usage to see the Sandboxes this MCP server is tracking.",
      inputSchema: z.object({
        limit: z.number().int().positive().optional(),
        status: sandboxStatusSchema.optional(),
      }),
    },
    (input) =>
      handleTool(async () => {
        const sandboxes = await session.client.sandboxes.list();
        const filtered =
          input.status === undefined
            ? sandboxes
            : sandboxes.filter((sandbox) => sandbox.status === input.status);
        return formatSandboxList(
          input.limit === undefined ? filtered : filtered.slice(0, input.limit),
        );
      }),
  );
}

export function registerGetSandbox(server: McpServer, session: McpSession): void {
  server.registerTool(
    "get_sandbox",
    {
      description:
        "Inspect a CrowNest Sandbox. Pass sandbox_id to inspect a specific Sandbox, or omit sandbox_id to lazily create or reuse the current default Sandbox for this MCP session.",
      inputSchema: z.object({
        sandbox_id: sandboxIdSchema.optional(),
      }),
    },
    (input) =>
      handleTool(async () => {
        const sandbox =
          input.sandbox_id === undefined
            ? await session.resolveDefaultSandbox()
            : await session.client.sandboxes.get(input.sandbox_id as `sbx_${string}`);
        return formatSandbox(sandbox);
      }),
  );
}

export function registerExtendSandbox(server: McpServer, session: McpSession): void {
  server.registerTool(
    "extend_sandbox",
    {
      description:
        "Extend a live CrowNest Sandbox by resetting its Sandbox TTL from now. Pass sandbox_id or omit sandbox_id to extend the current lazy default Sandbox; expired Sandboxes cannot be revived.",
      inputSchema: z.object({
        sandbox_id: sandboxIdSchema.optional(),
        ttl_ms: z.number().int().positive(),
      }),
    },
    (input) =>
      handleTool(async () => {
        if (input.sandbox_id === undefined) {
          const sandbox = await (
            await session.resolveDefaultSandbox()
          ).extend({ ttlMs: input.ttl_ms });
          session.rememberSandbox(sandbox);
          return formatSandbox(sandbox);
        }

        const sandbox = await session.client.sandboxes.extend(
          input.sandbox_id as `sbx_${string}`,
          { ttlMs: input.ttl_ms },
        );
        session.refreshTrackedSandbox(sandbox);
        return formatSandbox(sandbox);
      }),
  );
}
