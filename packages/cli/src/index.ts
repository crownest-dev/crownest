#!/usr/bin/env -S node --import tsx

import { realpathSync } from "node:fs";
import { writeFile as writeFileBytes } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  createCrowNestClient,
  type CrowNestClient,
  type CrowNestClientOptions,
  type RunCommandOptions,
} from "@crownest/sdk";

import { codeRunCommand } from "./code-commands";
import { loadCredentialConfig } from "./credential-config";
import {
  deleteFileCommand,
  listFilesCommand,
  mkdirCommand,
  moveFileCommand,
  readFileCommand,
  statFileCommand,
  uploadFileCommand,
  writeFileCommand,
} from "./file-commands";
import {
  createApiKeyCommand,
  listApiKeysCommand,
  loginCommand,
} from "./human-commands";
import {
  createPreviewCommand,
  listPreviewsCommand,
  revokePreviewCommand,
} from "./preview-commands";

export const cliName = "crownest";

export const canonicalCliCommands = [
  "login",
  "projects list",
  "keys create",
  "keys list",
  "sandboxes create",
  "sandboxes extend",
  "sandboxes list",
  "sandboxes kill",
  "exec",
  "commands run",
  "commands start",
  "commands cancel",
  "logs",
  "code run",
  "files read",
  "files write",
  "files upload",
  "files list",
  "files stat",
  "files mkdir",
  "files move",
  "files delete",
  "artifacts create",
  "artifacts list",
  "artifacts download",
  "artifacts delete",
  "previews create",
  "previews list",
  "previews revoke",
] as const;

export type CanonicalCliCommand = (typeof canonicalCliCommands)[number];

export type CliResult = {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
};

export type CliEnvironment = {
  readonly CROWNEST_API_KEY?: string;
  readonly CROWNEST_API_URL?: string;
  readonly CROWNEST_CONFIG_PATH?: string;
  readonly CROWNEST_DASHBOARD_URL?: string;
  readonly CROWNEST_ORG_ID?: string;
  readonly CROWNEST_ROLE?: string;
  readonly CROWNEST_USER_ID?: string;
  readonly HOME?: string;
  readonly XDG_CONFIG_HOME?: string;
};

export type CliOutput = {
  readonly stderr: { write(chunk: string): void };
  readonly stdout: { write(chunk: string): void };
};

export async function runCli(
  argv: readonly string[],
  environment: CliEnvironment = {},
  fetchImpl?: typeof fetch,
  output?: CliOutput,
): Promise<CliResult> {
  const [resource, action, ...rest] = argv;
  // Lazy: `login` must work before any credential exists, and the SDK now
  // fails fast at construction when no API key is available.
  let clientInstance: ReturnType<typeof createCrowNestClient> | undefined;
  const client = () => {
    clientInstance ??= createCrowNestClient(clientOptions(environment, fetchImpl));
    return clientInstance;
  };
  const command = `${resource ?? ""} ${action ?? ""}`;
  const handlers: Record<string, () => Promise<CliResult>> = {
    "keys create": () => createApiKeyCommand(rest, environment, fetchImpl),
    "keys list": () => listApiKeysCommand(rest, environment, fetchImpl),
    "commands cancel": () => cancelCommand(client(), rest),
    "commands run": () => runCommand(client(), rest),
    "commands start": () => startCommand(client(), rest),
    "code run": () => codeRunCommand(client(), rest, output),
    "artifacts create": () => createArtifact(client(), rest),
    "artifacts delete": () => deleteArtifact(client(), rest),
    "artifacts download": () => downloadArtifact(client(), rest),
    "artifacts list": () => listArtifacts(client(), rest),
    "files delete": () => deleteFileCommand(client(), rest),
    "files list": () => listFilesCommand(client(), rest),
    "files mkdir": () => mkdirCommand(client(), rest),
    "files move": () => moveFileCommand(client(), rest),
    "files read": () => readFileCommand(client(), rest),
    "files stat": () => statFileCommand(client(), rest),
    "files upload": () => uploadFileCommand(client(), rest),
    "files write": () => writeFileCommand(client(), rest),
    "previews create": () => createPreviewCommand(client(), rest),
    "previews list": () => listPreviewsCommand(client(), rest),
    "previews revoke": () => revokePreviewCommand(client(), rest),
    "projects list": () => listProjects(client()),
    "sandboxes create": () => createSandbox(client(), rest),
    "sandboxes extend": () => extendSandbox(client(), rest),
    "sandboxes kill": () => killSandbox(client(), rest),
    "sandboxes list": () => listSandboxes(client()),
  };
  const handler =
    resource === "logs"
      ? () => logs(client(), [action, ...rest], output)
      : resource === "login"
        ? () => Promise.resolve(loginCommand(compact([action, ...rest]), environment))
        : resource === "exec"
          ? () => executeCommand(client(), compact([action, ...rest]), "run")
          : handlers[command];

  try {
    if (handler) return await handler();

    return fail(`Unknown command. Try: ${canonicalCliCommands.join(", ")}\n`, 2);
  } catch (error) {
    return fail(`${error instanceof Error ? error.message : String(error)}\n`, 1);
  }
}

async function createSandbox(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const projectId = optionValue(args, "--project") as `prj_${string}` | undefined;
  const template = optionValue(args, "--template");
  const sandbox = await client.sandboxes.create({
    ...(projectId === undefined ? {} : { projectId }),
    ...(template === undefined ? {} : { template }),
  });

  return ok(`${sandbox.id}\n`);
}

async function listSandboxes(client: CrowNestClient): Promise<CliResult> {
  const sandboxes = await client.sandboxes.list();
  return ok(`${JSON.stringify({ data: sandboxes }, null, 2)}\n`);
}

async function extendSandbox(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const ttlMs = positiveIntegerOption(args, "--ttl-ms");
  const extended = await client.sandboxes.extend(
    requiredSandboxId(args[0], "sandbox id"),
    { ttlMs },
  );

  return ok(`${extended.id}\t${extended.expiresAt}\n`);
}

async function listProjects(client: CrowNestClient): Promise<CliResult> {
  const projects = await client.projects.list();
  return ok(`${JSON.stringify({ data: projects }, null, 2)}\n`);
}

async function killSandbox(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const killed = await client.sandboxes.kill(requiredSandboxId(args[0], "sandbox id"));

  return ok(`${killed.id}\t${killed.status}\n`);
}

async function runCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  return await executeCommand(client, args, "run");
}

async function startCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  return await executeCommand(client, args, "start");
}

async function cancelCommand(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const commandId = requiredArg(args[0], "command id");
  const command = await client.commands.cancel(commandId as `cmd_${string}`, {
    mode: args.includes("--force") ? "force" : "graceful",
  });

  return ok(`${command.id}\t${command.status}\n`);
}

async function logs(
  client: CrowNestClient,
  args: readonly (string | undefined)[],
  output: CliOutput | undefined,
): Promise<CliResult> {
  const target = requiredArg(args[0], "command id");
  const commandId = target.startsWith("cmd_") ? target : optionValue(args, "--command");

  if (!commandId?.startsWith("cmd_")) {
    throw new Error(
      "command id is required. Use logs cmd_... or logs sbx_... --command cmd_...",
    );
  }

  let stdout = "";
  for await (const event of client.commands.streamLogs(commandId as `cmd_${string}`)) {
    if (event.type === "log") {
      if (output) {
        const stream = event.stream === "stderr" ? output.stderr : output.stdout;
        stream.write(event.data);
      } else {
        stdout += event.data;
      }
    } else if (event.type === "error") {
      throw new Error(`${event.code}: ${event.message}`);
    }
  }

  return ok(stdout);
}

async function createArtifact(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const name = optionValue(args, "--name");
  const artifact = await client.artifacts.create(
    requiredSandboxId(args[0], "sandbox id"),
    {
      path: requiredArg(args[1], "path"),
      ...(name === undefined ? {} : { name }),
    },
  );
  return ok(`${artifact.id}\n`);
}

async function listArtifacts(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const artifacts = await client.artifacts.list(
    requiredSandboxId(args[0], "sandbox id"),
  );
  return ok(`${JSON.stringify({ data: artifacts }, null, 2)}\n`);
}

async function downloadArtifact(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const artifactId = requiredArg(args[0], "artifact id") as `art_${string}`;
  const outputPath = optionValue(args, "--output") ?? optionValue(args, "-o");
  if (!outputPath) {
    throw new Error("output path is required. Use --output <path>.");
  }

  const data = await client.artifacts.download(artifactId);
  await writeFileBytes(outputPath, data);
  return ok(`${outputPath}\n`);
}

async function deleteArtifact(
  client: CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const artifactId = requiredArg(args[0], "artifact id") as `art_${string}`;
  const artifact = await client.artifacts.delete(artifactId);
  return ok(`${artifact.id}\tdeleted\n`);
}

function requiredSandboxId(value: string | undefined, label: string): `sbx_${string}` {
  return requiredArg(value, label) as `sbx_${string}`;
}

async function executeCommand(
  client: CrowNestClient,
  args: readonly string[],
  mode: "run" | "start",
): Promise<CliResult> {
  const sandboxId = requiredArg(args[0], "sandbox id");
  const commandArgs = args.slice(1);
  const command = commandAfterSeparator(commandArgs);
  const options =
    mode === "run" ? runCommandOptions(commandOptionArgs(commandArgs)) : {};
  const result =
    mode === "run"
      ? await client.commands.run(sandboxId as `sbx_${string}`, command, options)
      : await client.commands.start(sandboxId as `sbx_${string}`, command, options);

  return ok(`${JSON.stringify(result, null, 2)}\n`);
}

function clientOptions(
  environment: CliEnvironment,
  fetchImpl: typeof fetch | undefined,
): CrowNestClientOptions {
  const config = loadCredentialConfig(environment);
  const apiKey = environment.CROWNEST_API_KEY ?? config.apiKey;
  const apiUrl = environment.CROWNEST_API_URL ?? config.apiUrl;

  return {
    ...(apiKey === undefined ? {} : { apiKey }),
    ...(apiUrl === undefined ? {} : { baseUrl: apiUrl }),
    ...(fetchImpl === undefined ? {} : { fetch: fetchImpl }),
  };
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

function positiveIntegerOption(args: readonly string[], flag: string): number {
  const value = optionValue(args, flag);
  if (value === undefined) {
    throw new Error(`${flag} is required.`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive integer.`);
  }

  return parsed;
}

function commandAfterSeparator(args: readonly string[]): string {
  const separatorIndex = args.indexOf("--");
  const commandParts = separatorIndex >= 0 ? args.slice(separatorIndex + 1) : args;

  if (commandParts.length === 0) {
    throw new Error("command is required.");
  }

  return commandParts.map(shellEscapeArg).join(" ");
}

function runCommandOptions(args: readonly string[]): RunCommandOptions {
  const collect = collectOptions(args);
  const collectOn = optionValue(args, "--collect-on");
  if (collectOn !== undefined && collectOn !== "success" && collectOn !== "always") {
    throw new Error("collect-on must be success or always.");
  }

  return {
    ...(collect.length === 0 ? {} : { collect }),
    ...(collectOn === undefined ? {} : { collectOn }),
  };
}

function collectOptions(args: readonly string[]) {
  const collect: { readonly path: string }[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--collect") {
      collect.push({ path: requiredArg(args[index + 1], "collect path") });
    }
  }

  return collect;
}

function commandOptionArgs(args: readonly string[]): readonly string[] {
  const separatorIndex = args.indexOf("--");
  return separatorIndex < 0 ? [] : args.slice(0, separatorIndex);
}

function shellEscapeArg(arg: string): string {
  if (/^[A-Za-z0-9_./:=@%+-]+$/.test(arg)) {
    return arg;
  }

  return `'${arg.replaceAll("'", "'\"'\"'")}'`;
}

function requiredArg(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function compact(values: readonly (string | undefined)[]): readonly string[] {
  return values.filter((value): value is string => value !== undefined);
}

function ok(stdout: string): CliResult {
  return { exitCode: 0, stderr: "", stdout };
}

function fail(stderr: string, exitCode: number): CliResult {
  return { exitCode, stderr, stdout: "" };
}

async function main() {
  const result = await runCli(process.argv.slice(2), process.env, undefined, {
    stderr: process.stderr,
    stdout: process.stdout,
  });

  if (result.stdout.length > 0) process.stdout.write(result.stdout);
  if (result.stderr.length > 0) process.stderr.write(result.stderr);

  process.exitCode = result.exitCode;
}

const currentModulePath = fileURLToPath(import.meta.url);

function isMainModule(entrypoint: string | undefined): boolean {
  try {
    return (
      entrypoint !== undefined &&
      realpathSync(entrypoint) === realpathSync(currentModulePath)
    );
  } catch {
    return false;
  }
}

if (isMainModule(process.argv[1])) void main();
