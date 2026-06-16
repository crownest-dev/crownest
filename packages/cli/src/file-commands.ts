import { readFile as readFileBytes } from "node:fs/promises";
import { basename } from "node:path";

import type { CrowNestClient } from "@crownest/sdk";

import {
  booleanFlag,
  jsonFlagSpec,
  parseFlags,
  rejectExtraPositionals,
  requiredArg,
  requiredPrefixedArg,
  stringFlag,
} from "./flags";
import type { CliResult } from "./index";
import { jsonEnvelope, renderList, renderRecord } from "./output";

export async function deleteFileCommand(
  client: () => CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const parsed = parseFlags(args, jsonFlagSpec);
  const sandboxId = requiredSandboxId(parsed.positionals[0], "sandbox id");
  const path = requiredArg(parsed.positionals[1], "path");
  rejectExtraPositionals(parsed.positionals.slice(2), "files delete");
  await client().files.delete(sandboxId, path);
  const result = { path, status: "deleted" };
  return ok(
    booleanFlag(parsed.flags, "--json") ? jsonEnvelope(result) : renderRecord(result),
  );
}

export async function listFilesCommand(
  client: () => CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const parsed = parseFlags(args, jsonFlagSpec);
  const sandboxId = requiredSandboxId(parsed.positionals[0], "sandbox id");
  const path = parsed.positionals[1];
  rejectExtraPositionals(parsed.positionals.slice(2), "files list");
  const files = await client().files.list(sandboxId, path);
  return ok(
    booleanFlag(parsed.flags, "--json")
      ? jsonEnvelope(files)
      : renderList(files, [
          { key: "path" },
          { key: "type" },
          { key: "sizeBytes", label: "size" },
          { key: "modifiedAt" },
        ]),
  );
}

export async function mkdirCommand(
  client: () => CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const parsed = parseFlags(args, {
    "--parents": "boolean",
    ...jsonFlagSpec,
  });
  const sandboxId = requiredSandboxId(parsed.positionals[0], "sandbox id");
  const path = requiredArg(parsed.positionals[1], "path");
  rejectExtraPositionals(parsed.positionals.slice(2), "files mkdir");
  const file = await client().files.mkdir(sandboxId, path, {
    parents: booleanFlag(parsed.flags, "--parents"),
  });
  return ok(
    booleanFlag(parsed.flags, "--json") ? jsonEnvelope(file) : renderRecord(file),
  );
}

export async function moveFileCommand(
  client: () => CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const parsed = parseFlags(args, {
    "--overwrite": "boolean",
    ...jsonFlagSpec,
  });
  const sandboxId = requiredSandboxId(parsed.positionals[0], "sandbox id");
  const from = requiredArg(parsed.positionals[1], "from");
  const to = requiredArg(parsed.positionals[2], "to");
  rejectExtraPositionals(parsed.positionals.slice(3), "files move");
  const file = await client().files.move(sandboxId, from, to, {
    overwrite: booleanFlag(parsed.flags, "--overwrite"),
  });
  return ok(
    booleanFlag(parsed.flags, "--json") ? jsonEnvelope(file) : renderRecord(file),
  );
}

export async function readFileCommand(
  client: () => CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const parsed = parseFlags(args, jsonFlagSpec);
  const sandboxId = requiredSandboxId(parsed.positionals[0], "sandbox id");
  const path = requiredArg(parsed.positionals[1], "path");
  rejectExtraPositionals(parsed.positionals.slice(2), "files read");
  const content = await client().files.read(sandboxId, path);
  return ok(booleanFlag(parsed.flags, "--json") ? jsonEnvelope(content) : content);
}

export async function statFileCommand(
  client: () => CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const parsed = parseFlags(args, jsonFlagSpec);
  const sandboxId = requiredSandboxId(parsed.positionals[0], "sandbox id");
  const path = requiredArg(parsed.positionals[1], "path");
  rejectExtraPositionals(parsed.positionals.slice(2), "files stat");
  const file = await client().files.stat(sandboxId, path);
  return ok(
    booleanFlag(parsed.flags, "--json") ? jsonEnvelope(file) : renderRecord(file),
  );
}

export async function uploadFileCommand(
  client: () => CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const parsed = parseFlags(args, {
    "--create-parents": "boolean",
    "--to": "string",
    ...jsonFlagSpec,
  });
  const sandboxId = requiredSandboxId(parsed.positionals[0], "sandbox id");
  const localPath = requiredArg(parsed.positionals[1], "local path");
  const remotePathFlag = stringFlag(parsed.flags, "--to");
  const positionalRemotePath = parsed.positionals[2];
  const remotePath = remotePathFlag ?? positionalRemotePath ?? basename(localPath);
  rejectExtraPositionals(
    parsed.positionals.slice(
      remotePathFlag === undefined && positionalRemotePath !== undefined ? 3 : 2,
    ),
    "files upload",
  );
  const content = await readFileBytes(localPath);
  const file = await client().files.write(
    sandboxId,
    remotePath,
    content.toString("base64"),
    {
      createParents: booleanFlag(parsed.flags, "--create-parents"),
      encoding: "base64",
    },
  );

  return ok(
    booleanFlag(parsed.flags, "--json") ? jsonEnvelope(file) : renderRecord(file),
  );
}

export async function writeFileCommand(
  client: () => CrowNestClient,
  args: readonly string[],
): Promise<CliResult> {
  const [sandboxIdArg, pathArg, contentArg, ...flagArgs] = args;
  const parsed = parseFlags(flagArgs, {
    "--create-parents": "boolean",
    ...jsonFlagSpec,
  });
  const sandboxId = requiredSandboxId(sandboxIdArg, "sandbox id");
  const path = requiredArg(pathArg, "path");
  const content = requiredArg(contentArg, "content");
  rejectExtraPositionals(parsed.positionals, "files write");
  const file = await client().files.write(sandboxId, path, content, {
    createParents: booleanFlag(parsed.flags, "--create-parents"),
  });
  return ok(
    booleanFlag(parsed.flags, "--json") ? jsonEnvelope(file) : renderRecord(file),
  );
}

function requiredSandboxId(value: string | undefined, label: string): `sbx_${string}` {
  return requiredPrefixedArg(value, label, "sbx_") as `sbx_${string}`;
}

function ok(stdout: string): CliResult {
  return { exitCode: 0, stderr: "", stdout };
}
