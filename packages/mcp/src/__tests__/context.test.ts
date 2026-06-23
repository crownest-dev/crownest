import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it } from "vitest";

import {
  AGENT_CONTEXT_RESOURCE_URI,
  agentContextMarkdown,
  registerCrowNestContext,
} from "../context";
import type { McpSession } from "../session";

describe("CrowNest MCP context", () => {
  it("renders bounded context with current session Sandbox ids", () => {
    const markdown = agentContextMarkdown(session());

    expect(markdown).toContain("# CrowNest Agent Context");
    expect(markdown).toContain("Default Sandbox: sbx_default");
    expect(markdown).toContain("Tracked Sandboxes: sbx_default, sbx_adopted");
    expect(markdown).toContain("create_workspace_run");
    expect(markdown).toContain(
      "replay_workspace_run_events returns at most 500 events",
    );
  });

  it("registers native MCP context resource and prompts", () => {
    const resources: RegisteredResourceCall[] = [];
    const prompts: RegisteredPromptCall[] = [];
    const server = {
      registerPrompt(
        name: string,
        config: RegisteredPromptCall["config"],
        callback: RegisteredPromptCall["callback"],
      ) {
        prompts.push({ callback, config, name });
      },
      registerResource(
        name: string,
        uri: string,
        config: RegisteredResourceCall["config"],
        callback: RegisteredResourceCall["callback"],
      ) {
        resources.push({ callback, config, name, uri });
      },
    } as unknown as McpServer;

    registerCrowNestContext(server, session());

    expect(resources).toHaveLength(1);
    expect(resources[0]?.uri).toBe(AGENT_CONTEXT_RESOURCE_URI);
    expect(resources[0]?.config.mimeType).toBe("text/markdown");
    expect(resources[0]?.callback(new URL(AGENT_CONTEXT_RESOURCE_URI))).toMatchObject({
      contents: [
        {
          mimeType: "text/markdown",
          uri: AGENT_CONTEXT_RESOURCE_URI,
        },
      ],
    });
    expect(prompts.map((prompt) => prompt.name)).toEqual([
      "crownest_workspace_run",
      "crownest_sandbox_session",
    ]);
  });
});

function session(): McpSession {
  return {
    snapshot: () => ({
      defaultSandboxId: "sbx_default",
      sandboxIds: ["sbx_default", "sbx_adopted"],
    }),
  } as unknown as McpSession;
}

type RegisteredResourceCall = {
  readonly callback: (uri: URL) => unknown;
  readonly config: { readonly description?: string; readonly mimeType?: string };
  readonly name: string;
  readonly uri: string;
};

type RegisteredPromptCall = {
  readonly callback: () => unknown;
  readonly config: { readonly description?: string; readonly title?: string };
  readonly name: string;
};
