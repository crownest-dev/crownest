import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { McpSession } from "./session";
import {
  registerCreateProject,
  registerListApiKeys,
  registerRevokeApiKey,
} from "./tools/admin";
import {
  registerCreateArtifact,
  registerDeleteArtifact,
  registerDownloadArtifact,
  registerGetArtifact,
  registerListArtifacts,
} from "./tools/artifacts";
import {
  registerGetCodeContext,
  registerListCodeContexts,
  registerRunCode,
} from "./tools/code";
import {
  registerCancelCommand,
  registerGetCommand,
  registerRunCommand,
  registerStreamCommandLogs,
} from "./tools/commands";
import {
  registerDeleteFile,
  registerListFiles,
  registerMakeDirectory,
  registerMoveFile,
  registerReadFile,
  registerStatFile,
  registerWriteFile,
} from "./tools/files";
import {
  registerCreatePreview,
  registerGetPreview,
  registerListPreviews,
  registerRevokePreview,
} from "./tools/previews";
import {
  registerCreateSandbox,
  registerExtendSandbox,
  registerGetSandbox,
  registerKillSandbox,
  registerListSandboxes,
} from "./tools/sandboxes";
import type { ToolRegistrar } from "./tools/shared";
import { registerGetUsage } from "./tools/usage";

const toolRegistrars = [
  registerRunCode,
  registerRunCommand,
  registerCreateSandbox,
  registerKillSandbox,
  registerWriteFile,
  registerReadFile,
  registerListFiles,
  registerDownloadArtifact,
  registerListSandboxes,
  registerGetUsage,
  registerGetSandbox,
  registerExtendSandbox,
  registerGetCommand,
  registerCancelCommand,
  registerStreamCommandLogs,
  registerDeleteFile,
  registerMoveFile,
  registerMakeDirectory,
  registerStatFile,
  registerCreateArtifact,
  registerListArtifacts,
  registerGetArtifact,
  registerDeleteArtifact,
  registerCreatePreview,
  registerListPreviews,
  registerGetPreview,
  registerRevokePreview,
  registerListCodeContexts,
  registerGetCodeContext,
  registerListApiKeys,
  registerRevokeApiKey,
  registerCreateProject,
] satisfies readonly ToolRegistrar[];

export function registerCrowNestTools(server: McpServer, session: McpSession): void {
  for (const registerTool of toolRegistrars) {
    registerTool(server, session);
  }
}
