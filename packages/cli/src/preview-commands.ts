import type { CrowNestClient } from "@crownest/sdk";

import {
  booleanFlag,
  jsonFlagSpec,
  parseFlags,
  rejectExtraPositionals,
  requiredArg,
  requiredPrefixedArg,
  stringFlag,
  UsageError,
} from "./flags";
import type { CliResult } from "./index";
import { jsonEnvelope, renderList, renderRecord } from "./output";

export async function createPreviewCommand(
  client: () => CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const parsed = parseFlags(args, {
    "--auth": "string",
    "--port": "string",
    ...jsonFlagSpec,
  });
  const port = requiredPort(stringFlag(parsed.flags, "--port"));
  const authMode = previewAuthMode(stringFlag(parsed.flags, "--auth"));
  const sandboxId = requiredSandboxId(parsed.positionals[0], "sandbox id");
  rejectExtraPositionals(parsed.positionals.slice(1), "previews create");
  const response = await client().previews.create(sandboxId, {
    ...(authMode === undefined ? {} : { authMode }),
    port,
  });
  if (booleanFlag(parsed.flags, "--json")) {
    return ok(jsonEnvelope(response));
  }

  const lines = [response.preview.url];
  if (response.previewToken) {
    lines.push(`Preview token (shown once): ${response.previewToken}`);
  }

  return ok(`${lines.join("\n")}\n`);
}

export async function listPreviewsCommand(
  client: () => CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const parsed = parseFlags(args, jsonFlagSpec);
  const sandboxId = requiredSandboxId(parsed.positionals[0], "sandbox id");
  rejectExtraPositionals(parsed.positionals.slice(1), "previews list");
  const previews = await client().previews.list(sandboxId);
  return ok(
    booleanFlag(parsed.flags, "--json")
      ? jsonEnvelope(previews)
      : renderList(previews, [
          { key: "id" },
          { key: "url" },
          { key: "port" },
          { key: "authMode" },
        ]),
  );
}

export async function revokePreviewCommand(
  client: () => CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const parsed = parseFlags(args, jsonFlagSpec);
  const previewId = requiredArg(parsed.positionals[0], "preview id") as `prv_${string}`;
  rejectExtraPositionals(parsed.positionals.slice(1), "previews revoke");
  const preview = await client().previews.revoke(previewId);
  const result = { ...preview, status: "revoked" };
  return ok(
    booleanFlag(parsed.flags, "--json") ? jsonEnvelope(result) : renderRecord(result),
  );
}

function requiredSandboxId(value: string | undefined, label: string): `sbx_${string}` {
  return requiredPrefixedArg(value, label, "sbx_") as `sbx_${string}`;
}

function requiredPort(value: string | undefined): number {
  const rawPort = requiredArg(value, "port");
  if (!/^[0-9]+$/.test(rawPort)) {
    throw new UsageError("port must be an integer from 1 to 65535.");
  }

  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new UsageError("port must be an integer from 1 to 65535.");
  }

  return port;
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

  throw new UsageError("--auth must be authenticated or token.");
}

function ok(stdout: string): CliResult {
  return { exitCode: 0, stderr: "", stdout };
}
