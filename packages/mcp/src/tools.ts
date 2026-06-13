import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod/v4";

import { toolError } from "./errors";
import {
  formatArtifactDownload,
  formatCodeRun,
  formatCommand,
  formatFiles,
  jsonTextResult,
} from "./formatting";
import type { McpSession } from "./session";

const sandboxIdSchema = z.custom<`sbx_${string}`>(
  (value) => typeof value === "string" && value.startsWith("sbx_"),
  "Expected a Sandbox id like sbx_...",
);
const artifactIdSchema = z.custom<`art_${string}`>(
  (value) => typeof value === "string" && value.startsWith("art_"),
  "Expected an Artifact id like art_...",
);

export function registerCrowNestTools(server: McpServer, session: McpSession): void {
  registerRunCode(server, session);
  registerRunCommand(server, session);
  registerCreateSandbox(server, session);
  registerKillSandbox(server, session);
  registerWriteFile(server, session);
  registerReadFile(server, session);
  registerListFiles(server, session);
  registerDownloadArtifact(server, session);
}

function registerRunCode(server: McpServer, session: McpSession): void {
  server.registerTool(
    "run_code",
    {
      description:
        "Run Python code in a CrowNest Sandbox. The Workspace is /workspace, and variables/imports persist across calls in the same Sandbox. Returns stdout, stderr, promoted Artifacts, and the sandbox_id.",
      inputSchema: z.object({
        code: z.string(),
        sandbox_id: sandboxIdSchema.optional(),
        timeout_ms: z.number().int().positive().optional(),
      }),
    },
    (input) =>
      handleTool(async () => {
        const sandbox = await session.resolveSandbox(input.sandbox_id);
        const result = await sandbox.code.run({
          artifactPolicy: "promote",
          code: input.code,
          ...(input.timeout_ms === undefined ? {} : { timeoutMs: input.timeout_ms }),
        });
        return formatCodeRun(result);
      }),
  );
}

function registerRunCommand(server: McpServer, session: McpSession): void {
  server.registerTool(
    "run_command",
    {
      description:
        "Run a Command in a CrowNest Sandbox. The Workspace is /workspace by default. Returns exit code, stdout, stderr, and the sandbox_id.",
      inputSchema: z.object({
        command: z.string(),
        cwd: z.string().optional(),
        sandbox_id: sandboxIdSchema.optional(),
        timeout_ms: z.number().int().positive().optional(),
      }),
    },
    (input) =>
      handleTool(async () => {
        const sandbox = await session.resolveSandbox(input.sandbox_id);
        const command = await sandbox.commands.run(input.command, {
          ...(input.cwd === undefined ? {} : { cwd: input.cwd }),
          ...(input.timeout_ms === undefined ? {} : { timeoutMs: input.timeout_ms }),
        });
        return formatCommand({
          sandboxId: sandbox.id,
          stderr: command.stderr ?? "",
          stdout: command.stdout ?? "",
          ...(command.exitCode === undefined ? {} : { exitCode: command.exitCode }),
        });
      }),
  );
}

function registerCreateSandbox(server: McpServer, session: McpSession): void {
  server.registerTool(
    "create_sandbox",
    {
      description:
        "Create a CrowNest Sandbox for this MCP server session. The Sandbox has a Workspace at /workspace and can be reused by passing sandbox_id.",
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

function registerKillSandbox(server: McpServer, session: McpSession): void {
  server.registerTool(
    "kill_sandbox",
    {
      description:
        "Kill a CrowNest Sandbox created by this MCP server session. If it is the default Sandbox, the next tool call creates a new default Sandbox.",
      inputSchema: z.object({
        sandbox_id: sandboxIdSchema,
      }),
    },
    (input) =>
      handleTool(async () => {
        await session.killSandbox(input.sandbox_id);
        return jsonTextResult({ killed: true, sandbox_id: input.sandbox_id });
      }),
  );
}

function registerWriteFile(server: McpServer, session: McpSession): void {
  server.registerTool(
    "write_file",
    {
      description:
        "Write a utf-8 text file in a CrowNest Sandbox Workspace. Use paths under /workspace and pass sandbox_id to target a non-default Sandbox.",
      inputSchema: z.object({
        content: z.string(),
        path: z.string(),
        sandbox_id: sandboxIdSchema.optional(),
      }),
    },
    (input) =>
      handleTool(async () => {
        const sandbox = await session.resolveSandbox(input.sandbox_id);
        const file = await sandbox.files.write(input.path, input.content, {
          encoding: "utf8",
        });
        return jsonTextResult({ file, sandbox_id: sandbox.id });
      }),
  );
}

function registerReadFile(server: McpServer, session: McpSession): void {
  server.registerTool(
    "read_file",
    {
      description:
        "Read a utf-8 text file from a CrowNest Sandbox Workspace. Use paths under /workspace and pass sandbox_id to target a non-default Sandbox.",
      inputSchema: z.object({
        path: z.string(),
        sandbox_id: sandboxIdSchema.optional(),
      }),
    },
    (input) =>
      handleTool(async () => {
        const sandbox = await session.resolveSandbox(input.sandbox_id);
        const content = await sandbox.files.read(input.path, { encoding: "utf8" });
        return jsonTextResult({
          content,
          path: input.path,
          sandbox_id: sandbox.id,
        });
      }),
  );
}

function registerListFiles(server: McpServer, session: McpSession): void {
  server.registerTool(
    "list_files",
    {
      description:
        "List files in a CrowNest Sandbox Workspace. Defaults to /workspace and returns file entries with the sandbox_id.",
      inputSchema: z.object({
        path: z.string().optional(),
        sandbox_id: sandboxIdSchema.optional(),
      }),
    },
    (input) =>
      handleTool(async () => {
        const sandbox = await session.resolveSandbox(input.sandbox_id);
        const files = await sandbox.files.list(input.path);
        return formatFiles(sandbox.id, files);
      }),
  );
}

function registerDownloadArtifact(server: McpServer, session: McpSession): void {
  server.registerTool(
    "download_artifact",
    {
      description:
        "Download a CrowNest Artifact by Artifact id. Returns base64 content and content type so MCP hosts can render images or other outputs.",
      inputSchema: z.object({
        artifact_id: artifactIdSchema,
      }),
    },
    (input) =>
      handleTool(async () => {
        const artifact = await session.client.artifacts.get(input.artifact_id);
        const bytes = await session.client.artifacts.download(input.artifact_id);
        return formatArtifactDownload(artifact, bytes);
      }),
  );
}

async function handleTool(
  callback: () => Promise<CallToolResult>,
): Promise<CallToolResult> {
  try {
    return await callback();
  } catch (error) {
    return toolError(error);
  }
}
