#!/usr/bin/env node

import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { loadSessionConfig, type McpSession } from "./session";
import { McpSession as CrowNestMcpSession } from "./session";
import { registerCrowNestTools } from "./tools";
import { OmittedArgumentsTransport } from "./transport";

export async function main(): Promise<void> {
  const session = new CrowNestMcpSession(loadSessionConfig());
  const server = new McpServer({
    name: "@crownest/mcp",
    version: readPackageVersion(),
  });

  registerCrowNestTools(server, session);
  installCleanupHandlers(session);

  const transport = new OmittedArgumentsTransport(new StdioServerTransport());
  await server.connect(transport);
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
