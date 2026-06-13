import type { CallToolResult, TextContent } from "@modelcontextprotocol/sdk/types.js";

const CODE_ERROR_MAX_LENGTH = 2_000;

type CodeOutput =
  | {
      readonly kind: "artifact";
      readonly artifactId: string;
      readonly contentType: string;
      readonly format: string;
      readonly sizeBytes: number;
    }
  | { readonly kind: "inline"; readonly format: string; readonly value: unknown }
  | { readonly kind: "rejected"; readonly format: string; readonly reason: string };

type CodeRunResult = {
  readonly contextId?: string;
  readonly durationMs?: number;
  readonly error?: {
    readonly message: string;
    readonly name?: string;
    readonly traceback?: readonly string[];
  };
  readonly executionCount?: number;
  readonly outputs?: readonly CodeOutput[];
  readonly sandboxId: string;
  readonly stderr?: readonly string[];
  readonly stdout?: readonly string[];
};

type CommandResult = {
  readonly exitCode?: number;
  readonly sandboxId: string;
  readonly stderr?: string;
  readonly stdout?: string;
};

type ArtifactMetadata = {
  readonly contentType?: string;
  readonly id: string;
};

type FileEntry = {
  readonly path: string;
  readonly sizeBytes?: number;
  readonly type?: string;
};

export function textResult(text: string): CallToolResult {
  return { content: [textContent(text)] };
}

export function jsonTextResult(value: unknown): CallToolResult {
  return textResult(`${JSON.stringify(value, null, 2)}\n`);
}

export function formatCodeRun(result: CodeRunResult): CallToolResult {
  if (result.error !== undefined) {
    const prefix = `sandbox_id: ${result.sandboxId}\n`;
    return {
      content: [textContent(`${prefix}${truncate(formatCodeError(result.error))}`)],
      isError: true,
    };
  }

  const lines = [
    `sandbox_id: ${result.sandboxId}`,
    ...(result.contextId === undefined ? [] : [`context_id: ${result.contextId}`]),
    ...(result.executionCount === undefined
      ? []
      : [`execution_count: ${result.executionCount}`]),
    ...(result.durationMs === undefined ? [] : [`duration_ms: ${result.durationMs}`]),
    `stdout:\n${joinLines(result.stdout)}`,
    `stderr:\n${joinLines(result.stderr)}`,
    ...formatCodeOutputs(result.outputs ?? []),
  ];

  return textResult(`${lines.join("\n")}\n`);
}

export function formatCommand(command: CommandResult): CallToolResult {
  return textResult(
    [
      `sandbox_id: ${command.sandboxId}`,
      `exit_code: ${command.exitCode ?? ""}`,
      `stdout:\n${command.stdout ?? ""}`,
      `stderr:\n${command.stderr ?? ""}`,
    ].join("\n") + "\n",
  );
}

export function formatFiles(
  sandboxId: string,
  files: readonly FileEntry[],
): CallToolResult {
  return jsonTextResult({
    data: files,
    sandbox_id: sandboxId,
  });
}

export function formatArtifactDownload(
  artifact: ArtifactMetadata,
  bytes: Uint8Array,
): CallToolResult {
  return jsonTextResult({
    artifact_id: artifact.id,
    content_base64: Buffer.from(bytes).toString("base64"),
    content_type: artifact.contentType ?? "application/octet-stream",
  });
}

function textContent(text: string): TextContent {
  return { text, type: "text" };
}

function joinLines(lines: readonly string[] | undefined): string {
  return lines?.join("\n") ?? "";
}

function formatCodeOutputs(outputs: readonly CodeOutput[]): readonly string[] {
  return outputs.map((output) => {
    if (output.kind === "artifact") {
      return `artifact: ${output.artifactId} (${output.contentType}, ${output.sizeBytes}B)`;
    }

    if (output.kind === "rejected") {
      return `rejected output: ${output.format} (${output.reason})`;
    }

    return `output (${output.format}): ${formatInlineValue(output.value)}`;
  });
}

function formatInlineValue(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value);
}

function formatCodeError(error: NonNullable<CodeRunResult["error"]>): string {
  const header =
    error.name === undefined ? error.message : `${error.name}: ${error.message}`;
  const traceback = error.traceback?.join("\n");
  return traceback === undefined ? header : `${header}\n${traceback}`;
}

function truncate(value: string): string {
  if (value.length <= CODE_ERROR_MAX_LENGTH) {
    return value;
  }

  return `${value.slice(0, CODE_ERROR_MAX_LENGTH)}...`;
}
