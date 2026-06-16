import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import type { McpSession } from "../session";
import { formatUsageSummary } from "../usage-formatting";
import { handleTool } from "./shared";

export function registerGetUsage(server: McpServer, session: McpSession): void {
  server.registerTool(
    "get_usage",
    {
      description:
        "Read current CrowNest compute usage, credits, quotas, and MCP-session Sandbox state. This calls client.usage(), does not create or mutate Sandboxes, and shows which Sandboxes this MCP server is tracking.",
      inputSchema: z.object({}),
    },
    () =>
      handleTool(async () =>
        formatUsageSummary(await session.client.usage(), session.snapshot()),
      ),
  );
}
