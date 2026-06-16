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
    readonly cancelCommand: Mock;
    readonly createSandbox: Mock;
    readonly createProject: Mock;
    readonly deleteArtifact: Mock;
    readonly downloadArtifact: Mock;
    readonly extendSandbox: Mock;
    readonly getArtifact: Mock;
    readonly getCommand: Mock;
    readonly getPreview: Mock;
    readonly getSandbox: Mock;
    readonly listApiKeys: Mock;
    readonly listSandboxes: Mock;
    readonly readCommandLogs: Mock;
    readonly revokeApiKey: Mock;
    readonly revokePreview: Mock;
    readonly usage: Mock;
  };
};

export type TestSandbox = SandboxHandle & {
  readonly mocks: {
    readonly artifactCreate: Mock;
    readonly artifactList: Mock;
    readonly codeGetContext: Mock;
    readonly codeListContexts: Mock;
    readonly codeRun: Mock;
    readonly commandCancel: Mock;
    readonly commandRun: Mock;
    readonly fileDelete: Mock;
    readonly fileList: Mock;
    readonly fileMkdir: Mock;
    readonly fileMove: Mock;
    readonly fileRead: Mock;
    readonly fileStat: Mock;
    readonly fileWrite: Mock;
    readonly kill: Mock;
    readonly previewCreate: Mock;
    readonly previewList: Mock;
    readonly sandboxExtend: Mock;
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

export function createSandboxHandle(
  id: `sbx_${string}`,
  input: {
    readonly expiresAt?: string;
    readonly status?: SandboxHandle["status"];
  } = {},
): TestSandbox {
  const mocks = sandboxMocks();
  return {
    artifacts: {
      create: mocks.artifactCreate,
      list: mocks.artifactList,
    },
    code: {
      getContext: mocks.codeGetContext,
      listContexts: mocks.codeListContexts,
      run: mocks.codeRun,
    },
    commands: { cancel: mocks.commandCancel, run: mocks.commandRun },
    createdAt: "2026-06-12T12:00:00.000Z",
    expiresAt: input.expiresAt ?? "2999-01-01T00:00:00.000Z",
    files: {
      delete: mocks.fileDelete,
      list: mocks.fileList,
      mkdir: mocks.fileMkdir,
      move: mocks.fileMove,
      read: mocks.fileRead,
      stat: mocks.fileStat,
      write: mocks.fileWrite,
    },
    id,
    kill: mocks.kill,
    mocks,
    previews: {
      create: mocks.previewCreate,
      list: mocks.previewList,
    },
    projectId: "prj_test",
    status: input.status ?? "ready",
    templateSlug: "python",
    templateVersion: "1.0.0",
    ttlMs: 60_000,
    extend: mocks.sandboxExtend,
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
  const listSandboxes = vi.fn();
  const getSandbox = vi.fn();
  const extendSandbox = vi.fn();
  const getCommand = vi.fn();
  const cancelCommand = vi.fn();
  const readCommandLogs = vi.fn();
  const createProject = vi.fn();
  const deleteArtifact = vi.fn();
  const download = vi.fn();
  const get = vi.fn();
  const getPreview = vi.fn();
  const revokePreview = vi.fn();
  const listApiKeys = vi.fn();
  const revokeApiKey = vi.fn();
  const usage = vi.fn();
  for (const sandbox of sandboxes) {
    create.mockResolvedValueOnce(sandbox);
  }

  return {
    apiKeys: { list: listApiKeys, revoke: revokeApiKey },
    artifacts: { delete: deleteArtifact, download, get },
    code: {},
    commands: {
      cancel: cancelCommand,
      get: getCommand,
      logs: readCommandLogs,
    },
    files: {},
    mocks: {
      cancelCommand,
      createSandbox: create,
      createProject,
      deleteArtifact,
      downloadArtifact: download,
      extendSandbox,
      getArtifact: get,
      getCommand,
      getPreview,
      getSandbox,
      listApiKeys,
      listSandboxes,
      readCommandLogs,
      revokeApiKey,
      revokePreview,
      usage,
    },
    previews: { get: getPreview, revoke: revokePreview },
    projects: { create: createProject },
    sandboxes: {
      create,
      extend: extendSandbox,
      get: getSandbox,
      list: listSandboxes,
    },
    usage,
  } as unknown as TestClient;
}

function sandboxMocks(): TestSandbox["mocks"] {
  return {
    artifactCreate: vi.fn(),
    artifactList: vi.fn(),
    codeGetContext: vi.fn(),
    codeListContexts: vi.fn(),
    codeRun: vi.fn(),
    commandCancel: vi.fn(),
    commandRun: vi.fn(),
    fileDelete: vi.fn().mockResolvedValue(undefined),
    fileList: vi.fn(),
    fileMkdir: vi.fn(),
    fileMove: vi.fn(),
    fileRead: vi.fn(),
    fileStat: vi.fn(),
    fileWrite: vi.fn(),
    kill: vi.fn().mockResolvedValue(undefined),
    previewCreate: vi.fn(),
    previewList: vi.fn(),
    sandboxExtend: vi.fn(),
  };
}
