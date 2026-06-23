import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod/v4";

import { agentContextMarkdown } from "../context";
import { textResult } from "../formatting";
import type { McpSession } from "../session";
import { handleTool } from "./shared";

export function registerGetAgentContext(server: McpServer, session: McpSession): void {
  server.registerTool(
    "get_agent_context",
    {
      description:
        "Return bounded CrowNest agent context as Markdown, including current MCP session Sandbox ids, recommended workflows, idempotency notes, and docs links.",
      inputSchema: z.object({}),
    },
    () => handleTool(() => Promise.resolve(textResult(agentContextMarkdown(session)))),
  );
}
