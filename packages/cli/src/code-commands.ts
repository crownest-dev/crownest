import { readFile } from "node:fs/promises";

import type { CodeArtifactPolicy, CodeLanguage, CrowNestClient } from "@crownest/sdk";

import type { CliOutput, CliResult } from "./index";

export async function codeRunCommand(
  client: CrowNestClient,
  args: readonly string[],
  output?: CliOutput,
): Promise<CliResult> {
  try {
    return await codeRunCommandInner(client, args, output);
  } catch (error) {
    if (error instanceof UsageError) {
      return fail(`${error.message}\n`, 2);
    }
    throw error;
  }
}

async function codeRunCommandInner(
  client: CrowNestClient,
  args: readonly string[],
  output?: CliOutput,
): Promise<CliResult> {
  const sandboxId = sandboxIdArg(args[0]);
  const codeValue = optionValue(args, "--code");
  const fileValue = optionValue(args, "--file");

  if (
    (codeValue === undefined && fileValue === undefined) ||
    (codeValue !== undefined && fileValue !== undefined)
  ) {
    return fail("Use exactly one of --code <source> or --file <path>.\n", 2);
  }

  const language = languageOption(optionValue(args, "--language"));
  const artifactPolicy = artifactPolicyOption(optionValue(args, "--artifact-policy"));
  const timeoutMs = optionalPositiveIntegerOption(args, "--timeout-ms");
  const contextId = optionValue(args, "--context") as `cctx_${string}` | undefined;
  const cwd = optionValue(args, "--cwd");
  const idempotencyKey = optionValue(args, "--idempotency-key");
  const code = codeValue ?? (await readFile(requiredArg(fileValue, "file"), "utf8"));
  return collectCodeRunStream(
    client.code.runStream(sandboxId, {
      code,
      ...(artifactPolicy === undefined ? {} : { artifactPolicy }),
      ...(contextId === undefined ? {} : { contextId }),
      ...(cwd === undefined ? {} : { cwd }),
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      language,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    }),
    output,
  );
}

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UsageError";
  }
}

type ExecutionErrorState = {
  readonly message: string;
  readonly rendered: boolean;
};

type CodeRunStream = ReturnType<CrowNestClient["code"]["runStream"]>;

// eslint-disable-next-line complexity -- CodeRun stream rendering dispatches the full event union and final exit-state rules.
async function collectCodeRunStream(
  events: CodeRunStream,
  output?: CliOutput,
): Promise<CliResult> {
  let stdout = "";
  let stderr = "";
  let executionError: ExecutionErrorState | undefined;
  let completed = false;
  let streamedOutput = false;
  let streamedStderr = false;
  let streamedStdout = false;

  for await (const event of events) {
    switch (event.type) {
      case "stdout":
        streamedStdout = true;
        stdout += writeChunk(output?.stdout, event.data);
        break;
      case "stderr":
        streamedStderr = true;
        stderr += writeChunk(output?.stderr, event.data);
        break;
      case "output":
        streamedOutput = true;
        stdout += writeChunk(output?.stdout, renderCodeOutput(event.data));
        break;
      case "error": {
        const rendered = renderExecutionErrorEvent(event.data, executionError);
        executionError = rendered.state;
        stderr += writeChunk(output?.stderr, rendered.stderr);
        break;
      }
      case "complete":
        completed = true;
        if (!streamedStdout) {
          stdout += writeCodeChunks(output?.stdout, event.data.stdout);
        }
        if (!streamedStderr) {
          stderr += writeCodeChunks(output?.stderr, event.data.stderr);
        }
        if (!streamedOutput) {
          stdout += writeCodeOutputs(output?.stdout, event.data.outputs);
        }
        if (event.data.error !== undefined) {
          const rendered = renderExecutionErrorEvent(event.data.error, executionError);
          executionError = rendered.state;
          stderr += writeChunk(output?.stderr, rendered.stderr);
        }
        break;
    }
  }

  if (executionError !== undefined) {
    return codeRunResult(1, stdout, stderr, output);
  }

  if (!completed) {
    stderr += writeChunk(
      output?.stderr,
      "Error: code run stream ended before a complete event.\n",
    );
    return codeRunResult(1, stdout, stderr, output);
  }

  return codeRunResult(0, stdout, stderr, output);
}

function writeCodeChunks(
  stream: { write(chunk: string): void } | undefined,
  chunks: readonly string[],
) {
  return chunks.reduce((rendered, chunk) => rendered + writeChunk(stream, chunk), "");
}

function writeCodeOutputs(
  stream: { write(chunk: string): void } | undefined,
  outputs: readonly Parameters<typeof renderCodeOutput>[0][],
) {
  return outputs.reduce(
    (rendered, codeOutput) =>
      rendered + writeChunk(stream, renderCodeOutput(codeOutput)),
    "",
  );
}

function codeRunResult(
  exitCode: number,
  stdout: string,
  stderr: string,
  output?: CliOutput,
): CliResult {
  return { exitCode, stderr: output ? "" : stderr, stdout: output ? "" : stdout };
}

function renderExecutionErrorEvent(
  error: {
    readonly message: string;
    readonly name?: string;
  },
  current: ExecutionErrorState | undefined,
): { readonly state: ExecutionErrorState; readonly stderr: string } {
  if (current?.rendered) {
    return {
      state: { message: error.message, rendered: true },
      stderr: "",
    };
  }

  return {
    state: { message: error.message, rendered: true },
    stderr: renderExecutionError(error),
  };
}

function renderExecutionError(error: {
  readonly message: string;
  readonly name?: string;
}): string {
  return `${error.name ?? "Error"}: ${error.message}\n`;
}

function renderCodeOutput(output: {
  readonly artifactId?: string;
  readonly contentType?: string;
  readonly format: string;
  readonly kind: string;
  readonly reason?: string;
  readonly sizeBytes?: number;
  readonly value?: unknown;
}): string {
  if (output.kind === "artifact") {
    return `[artifact ${output.artifactId} ${output.contentType} ${output.sizeBytes}B]\n`;
  }
  if (output.kind === "rejected") {
    return `[rejected ${output.format} ${output.reason}]\n`;
  }
  if (typeof output.value === "string") {
    return `${output.value}\n`;
  }
  return `${JSON.stringify(output.value)}\n`;
}

function writeChunk(stream: { write(chunk: string): void } | undefined, chunk: string) {
  if (stream) {
    stream.write(chunk);
    return "";
  }
  return chunk;
}

function languageOption(value: string | undefined): CodeLanguage {
  if (value === undefined) return "python";
  if (value === "python" || value === "javascript" || value === "typescript") {
    return value;
  }
  throw new UsageError("--language must be python, javascript, or typescript.");
}

function artifactPolicyOption(
  value: string | undefined,
): CodeArtifactPolicy | undefined {
  if (value === undefined) return undefined;
  if (value === "inline_only" || value === "promote") return value;
  throw new UsageError("--artifact-policy must be inline_only or promote.");
}

function optionalPositiveIntegerOption(
  args: readonly string[],
  flag: string,
): number | undefined {
  const value = optionValue(args, flag);
  if (value === undefined) return undefined;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new UsageError(`${flag} must be a positive integer.`);
  }
  return parsed;
}

function optionValue(args: readonly (string | undefined)[], flag: string) {
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new UsageError(`${flag} requires a value.`);
  }
  return value;
}

function requiredArg(value: string | undefined, label: string): string {
  if (!value) {
    throw new UsageError(`${label} is required.`);
  }
  return value;
}

function sandboxIdArg(value: string | undefined): `sbx_${string}` {
  if (value === undefined || value.startsWith("--")) {
    throw new UsageError("sandbox id is required.");
  }
  if (!value.startsWith("sbx_")) {
    throw new UsageError("sandbox id must start with sbx_.");
  }
  return value as `sbx_${string}`;
}

function fail(stderr: string, exitCode: number): CliResult {
  return { exitCode, stderr, stdout: "" };
}
