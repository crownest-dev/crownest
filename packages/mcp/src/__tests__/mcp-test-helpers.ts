import type { CrowNestClient, SandboxHandle } from "@crownest/sdk";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Mock } from "vitest";
import { vi } from "vitest";

import { McpSession } from "../session";
import { registerCrowNestTools } from "../tools";

export type RegisteredTool = {
  readonly config: { readonly description?: string; readonly inputSchema?: unknown };
  readonly handler: (input: never) => Promise<CallToolResult>;
  readonly name: string;
};

export type TestClient = CrowNestClient & {
  readonly mocks: {
    readonly createSandbox: Mock;
    readonly downloadArtifact: Mock;
    readonly getArtifact: Mock;
  };
};

export type TestSandbox = SandboxHandle & {
  readonly mocks: {
    readonly codeRun: Mock;
    readonly commandRun: Mock;
    readonly fileList: Mock;
    readonly fileRead: Mock;
    readonly fileWrite: Mock;
    readonly kill: Mock;
  };
};

export function createHarness(sandboxes: readonly SandboxHandle[] = []) {
  const tools = new Map<string, RegisteredTool>();
  const calls: RegisteredTool[] = [];
  const server = createServer(tools, calls);
  const client = createClient(sandboxes);
  const session = new McpSession({ apiKey: "cn_test", client });

  registerCrowNestTools(server, session);

  return { calls, client, tools };
}

export async function callTool(
  tools: ReadonlyMap<string, RegisteredTool>,
  name: string,
  input: unknown,
): Promise<CallToolResult> {
  const tool = tools.get(name);
  if (tool === undefined) {
    throw new Error(`Missing tool ${name}`);
  }

  return tool.handler(input as never);
}

export function text(result: CallToolResult): string {
  const first = result.content[0];
  return first?.type === "text" ? first.text : "";
}

export function createSandboxHandle(id: `sbx_${string}`): TestSandbox {
  const mocks = sandboxMocks();
  return {
    code: { run: mocks.codeRun },
    commands: { run: mocks.commandRun },
    expiresAt: "2999-01-01T00:00:00.000Z",
    files: {
      list: mocks.fileList,
      read: mocks.fileRead,
      write: mocks.fileWrite,
    },
    id,
    kill: mocks.kill,
    mocks,
  } as unknown as TestSandbox;
}

function createServer(
  tools: Map<string, RegisteredTool>,
  calls: RegisteredTool[],
): McpServer {
  return {
    registerTool(
      name: string,
      config: RegisteredTool["config"],
      handler: RegisteredTool["handler"],
    ) {
      const call = { config, handler, name };
      calls.push(call);
      tools.set(name, call);
    },
  } as unknown as McpServer;
}

function createClient(sandboxes: readonly SandboxHandle[]): TestClient {
  const create = vi.fn();
  const download = vi.fn();
  const get = vi.fn();
  for (const sandbox of sandboxes) {
    create.mockResolvedValueOnce(sandbox);
  }

  return {
    artifacts: { download, get },
    mocks: {
      createSandbox: create,
      downloadArtifact: download,
      getArtifact: get,
    },
    sandboxes: { create },
  } as unknown as TestClient;
}

function sandboxMocks(): TestSandbox["mocks"] {
  return {
    codeRun: vi.fn(),
    commandRun: vi.fn(),
    fileList: vi.fn(),
    fileRead: vi.fn(),
    fileWrite: vi.fn(),
    kill: vi.fn().mockResolvedValue(undefined),
  };
}
