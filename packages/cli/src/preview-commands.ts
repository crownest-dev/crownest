import type { CrowNestClient } from "@crownest/sdk";

import type { CliResult } from "./index";

export async function createPreviewCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const port = requiredPort(optionValue(args, "--port"));
  const authMode = previewAuthMode(optionalOptionValue(args, "--auth"));
  const response = await client.previews.create(
    requiredSandboxId(args[0], "sandbox id"),
    {
      ...(authMode === undefined ? {} : { authMode }),
      port,
    },
  );
  const lines = [response.preview.url];
  if (response.previewToken) {
    lines.push(`Preview token (shown once): ${response.previewToken}`);
  }

  return ok(`${lines.join("\n")}\n`);
}

export async function listPreviewsCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const previews = await client.previews.list(requiredSandboxId(args[0], "sandbox id"));
  return ok(`${JSON.stringify({ data: previews }, null, 2)}\n`);
}

export async function revokePreviewCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const previewId = requiredArg(args[0], "preview id") as `prv_${string}`;
  const preview = await client.previews.revoke(previewId);
  return ok(`${preview.id}\trevoked\n`);
}

function requiredSandboxId(value: string | undefined, label: string): `sbx_${string}` {
  return requiredArg(value, label) as `sbx_${string}`;
}

function requiredPort(value: string | undefined): number {
  const rawPort = requiredArg(value, "port");
  if (!/^[0-9]+$/.test(rawPort)) {
    throw new Error("port must be an integer from 1 to 65535.");
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("port must be an integer from 1 to 65535.");
  }

  return port;
}

function optionValue(
  args: readonly (string | undefined)[],
  flag: string,
): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }

  return args[index + 1];
}

function optionalOptionValue(
  args: readonly (string | undefined)[],
  flag: string,
): string | undefined {
  const index = args.indexOf(flag);
  if (index < 0) {
    return undefined;
  }

  const value = args[index + 1];
  if (value === undefined) {
    throw new Error(`${flag} requires a value.`);
  }

  return value;
}

function previewAuthMode(
  value: string | undefined,
): "token" | "authenticated" | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === "authenticated" || value === "token") {
    return value;
  }

  throw new Error("--auth must be authenticated or token.");
}

function requiredArg(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function ok(stdout: string): CliResult {
  return { exitCode: 0, stderr: "", stdout };
}
