#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerCrowNestContext } from "./context";
import { loadSessionConfig, type McpSession } from "./session";
import { McpSession as CrowNestMcpSession } from "./session";
import { registerCrowNestTools } from "./tools";
import { OmittedArgumentsTransport } from "./transport";

export async function main(): Promise<void> {
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    console.log(helpText(readPackageVersion()));
    return;
  }

  if (process.argv.includes("--version") || process.argv.includes("-v")) {
    console.log(readPackageVersion());
    return;
  }

  const session = new CrowNestMcpSession(loadSessionConfig());
  const server = createCrowNestMcpServer(readPackageVersion());

  registerCrowNestTools(server, session);
  registerCrowNestContext(server, session);
  installCleanupHandlers(session);

  const transport = new OmittedArgumentsTransport(new StdioServerTransport());
  await server.connect(transport);
}

export const CROWNEST_MCP_INSTRUCTIONS = [
  "CrowNest gives coding agents live cloud Sandboxes with a Workspace rooted at /workspace.",
  "Tools that accept sandbox_id can omit it to use the MCP session's lazy default Sandbox: the first default-scoped call creates it, later calls reuse it until it expires, is killed, or this MCP server exits.",
  "Sandboxes created by this MCP server are best-effort killed on MCP session exit; Sandbox TTL can be extended while live, and the platform TTL backstop still applies.",
  "run_code executes stateful Python Code Runs in the selected Sandbox. Variables and imports persist in the Code Context, and display outputs are auto-promoted to Artifacts when possible. Oversized, unsafe, or unsupported outputs are reported as rejected outputs.",
  "Workspace Run tools accept caller-provided idempotency_key values for retry-sensitive create, archive upload, staged transfer, finalize, and start operations. Use SDK or CLI idempotency-key options for other retry-sensitive mutations when needed.",
  "Use get_usage for current compute, credit, quota, and MCP-session Sandbox state. Use list_sandboxes for account-visible live Sandboxes.",
  "Use get_agent_context or the crownest://agent/context resource for bounded workflow guidance and current MCP session state.",
  "For the full capability map and retry/idempotency patterns, see https://crownest.dev/docs/api/capabilities and https://crownest.dev/docs/guides/agent-patterns.",
].join("\n\n");

export function createCrowNestMcpServer(version: string): McpServer {
  return new McpServer(
    {
      name: "@crownest/mcp",
      version,
    },
    { instructions: CROWNEST_MCP_INSTRUCTIONS },
  );
}

export function helpText(version: string): string {
  return [
    `@crownest/mcp ${version}`,
    "",
    "Usage:",
    "  crownest-mcp",
    "",
    "Environment:",
    "  CROWNEST_API_KEY   CrowNest API key",
    "  CROWNEST_API_URL   CrowNest API URL (default: https://api.crownest.dev)",
  ].join("\n");
}

function readPackageVersion(): string {
  const packageJson = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  ) as { readonly version?: string };

  return packageJson.version ?? "0.0.0";
}

export function installCleanupHandlers(
  session: McpSession,
  exit: (code: number) => never | void = exitProcess,
): void {
  const cleanupAndExit = createCleanupRunner(session, exit);
  const cleanup = () => {
    void cleanupAndExit();
  };
  process.once("beforeExit", cleanup);
  process.once("SIGINT", () => {
    void cleanupAndExit(130);
  });
  process.once("SIGTERM", () => {
    void cleanupAndExit(143);
  });
}

export function createCleanupRunner(
  session: Pick<McpSession, "cleanup">,
  exit: (code: number) => never | void = exitProcess,
): (exitCode?: number) => Promise<void> {
  let cleanupPromise: Promise<void> | undefined;

  return async (exitCode) => {
    cleanupPromise ??= runCleanup(session);
    await cleanupPromise;
    if (exitCode !== undefined) {
      exit(exitCode);
    }
  };
}

async function runCleanup(session: Pick<McpSession, "cleanup">): Promise<void> {
  await session.cleanup();
}

function exitProcess(code: number): never {
  process.exit(code);
}

if (isDirectRun()) {
  try {
    await main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(1);
  }
}

function isDirectRun(): boolean {
  const entrypoint = process.argv[1];
  if (entrypoint === undefined) {
    return false;
  }

  try {
    return realpathSync(fileURLToPath(import.meta.url)) === realpathSync(entrypoint);
  } catch {
    return false;
  }
}
