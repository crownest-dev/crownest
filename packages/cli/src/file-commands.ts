import { readFile as readFileBytes } from "node:fs/promises";

import type { CrowNestClient } from "@crownest/sdk";

import type { CliResult } from "./index";

export async function deleteFileCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  await client.files.delete(
    requiredSandboxId(args[0], "sandbox id"),
    requiredArg(args[1], "path"),
  );
  return ok("deleted\n");
}

export async function listFilesCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const files = await client.files.list(
    requiredSandboxId(args[0], "sandbox id"),
    args[1],
  );
  return ok(`${JSON.stringify({ data: files }, null, 2)}\n`);
}

export async function mkdirCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const file = await client.files.mkdir(
    requiredSandboxId(args[0], "sandbox id"),
    requiredArg(args[1], "path"),
    {
      parents: args.includes("--parents"),
    },
  );
  return ok(`${file.path}\n`);
}

export async function moveFileCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const file = await client.files.move(
    requiredSandboxId(args[0], "sandbox id"),
    requiredArg(args[1], "from"),
    requiredArg(args[2], "to"),
    { overwrite: args.includes("--overwrite") },
  );
  return ok(`${file.path}\n`);
}

export async function readFileCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const content = await client.files.read(
    requiredSandboxId(args[0], "sandbox id"),
    requiredArg(args[1], "path"),
  );
  return ok(content);
}

export async function statFileCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const file = await client.files.stat(
    requiredSandboxId(args[0], "sandbox id"),
    requiredArg(args[1], "path"),
  );
  return ok(`${JSON.stringify(file, null, 2)}\n`);
}

export async function uploadFileCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const sandboxId = requiredSandboxId(args[0], "sandbox id");
  const localPath = requiredArg(args[1], "local path");
  const remotePath = optionValue(args, "--to") ?? requiredArg(args[2], "remote path");
  const content = await readFileBytes(localPath);
  const file = await client.files.write(
    sandboxId,
    remotePath,
    content.toString("base64"),
    {
      createParents: args.includes("--create-parents"),
      encoding: "base64",
    },
  );

  return ok(`${file.path}\n`);
}

export async function writeFileCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const file = await client.files.write(
    requiredSandboxId(args[0], "sandbox id"),
    requiredArg(args[1], "path"),
    requiredArg(args[2], "content"),
    { createParents: args.includes("--create-parents") },
  );
  return ok(`${file.path}\n`);
}

function requiredSandboxId(value: string | undefined, label: string): `sbx_${string}` {
  return requiredArg(value, label) as `sbx_${string}`;
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

function requiredArg(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function ok(stdout: string): CliResult {
  return { exitCode: 0, stderr: "", stdout };
}
