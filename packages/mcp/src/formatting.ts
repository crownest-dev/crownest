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
  readonly commandId: string;
  readonly exitCode?: number;
  readonly sandboxId: string;
  readonly stderr?: string;
  readonly stdout?: string;
};

type CommandDetails = {
  readonly cancelMode?: string;
  readonly canceledAt?: string;
  readonly command: string;
  readonly cwd: string;
  readonly durationMs?: number;
  readonly exitCode?: number;
  readonly finishedAt?: string;
  readonly id: string;
  readonly sandboxId: string;
  readonly startedAt?: string;
  readonly status: string;
};

type CommandLogChunk = {
  readonly data: string;
  readonly seq: number;
  readonly stream: string;
};

type ArtifactMetadata = {
  readonly createdAt?: string;
  readonly contentType?: string;
  readonly deletedAt?: string;
  readonly id: string;
  readonly name?: string;
  readonly sandboxId?: string;
  readonly sizeBytes?: number;
  readonly sourcePath?: string;
};

type FileEntry = {
  readonly path: string;
  readonly sizeBytes?: number;
  readonly type?: string;
};

type FileStat = {
  readonly modifiedAt?: string;
  readonly path: string;
  readonly sizeBytes: number;
  readonly type: string;
};

type SandboxMetadata = {
  readonly createdAt?: string;
  readonly destroyedAt?: string;
  readonly expiresAt: string;
  readonly id: string;
  readonly projectId?: string;
  readonly status: string;
  readonly templateSlug?: string;
  readonly templateVersion?: string;
  readonly ttlMs?: number;
};

type PreviewMetadata = {
  readonly authMode: string;
  readonly createdAt?: string;
  readonly expiresAt?: string;
  readonly id: string;
  readonly port: number;
  readonly revokedAt?: string;
  readonly sandboxId: string;
  readonly slug: string;
  readonly url: string;
};

type CodeContextMetadata = {
  readonly createdAt?: string;
  readonly cwd: string;
  readonly expiresAt?: string;
  readonly id: string;
  readonly isDefault?: boolean;
  readonly language: string;
  readonly sandboxId: string;
};

type ApiKeyMetadata = {
  readonly createdAt?: string;
  readonly id: string;
  readonly last4: string;
  readonly lastUsedAt?: string;
  readonly name: string;
  readonly prefix: string;
  readonly projectIds?: readonly string[];
  readonly revokedAt?: string;
  readonly scopes: readonly string[];
};

type ProjectMetadata = {
  readonly createdAt?: string;
  readonly id: string;
  readonly name: string;
  readonly orgId?: string;
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
      `command_id: ${command.commandId}`,
      `sandbox_id: ${command.sandboxId}`,
      `exit_code: ${command.exitCode ?? ""}`,
      `stdout:\n${command.stdout ?? ""}`,
      `stderr:\n${command.stderr ?? ""}`,
    ].join("\n") + "\n",
  );
}

export function formatCommandDetails(command: CommandDetails): CallToolResult {
  return jsonTextResult({
    cancel_mode: command.cancelMode,
    canceled_at: command.canceledAt,
    command: command.command,
    command_id: command.id,
    cwd: command.cwd,
    duration_ms: command.durationMs,
    exit_code: command.exitCode,
    finished_at: command.finishedAt,
    sandbox_id: command.sandboxId,
    started_at: command.startedAt,
    status: command.status,
  });
}

export function formatCommandLogs(
  commandId: string,
  chunks: readonly CommandLogChunk[],
  maxLines: number,
): CallToolResult {
  const lines = chunks.flatMap((chunk) =>
    splitLogLines(chunk.data).map((line) => `${chunk.stream}: ${line}`),
  );
  const visible = lines.slice(0, maxLines);
  const truncated = lines.length > maxLines;

  return textResult(
    [
      `command_id: ${commandId}`,
      `max_lines: ${maxLines}`,
      `truncated: ${truncated}`,
      "logs:",
      ...visible,
      ...(truncated ? [`[truncated after ${maxLines} lines]`] : []),
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

export function formatFileStat(sandboxId: string, file: FileStat): CallToolResult {
  return jsonTextResult({
    modified_at: file.modifiedAt,
    path: file.path,
    sandbox_id: sandboxId,
    size_bytes: file.sizeBytes,
    type: file.type,
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

export function formatArtifact(artifact: ArtifactMetadata): CallToolResult {
  return jsonTextResult(artifactPayload(artifact));
}

export function formatArtifactList(
  sandboxId: string,
  artifacts: readonly ArtifactMetadata[],
): CallToolResult {
  return jsonTextResult({
    data: artifacts.map(artifactPayload),
    sandbox_id: sandboxId,
  });
}

export function formatSandbox(sandbox: SandboxMetadata): CallToolResult {
  return jsonTextResult(sandboxPayload(sandbox));
}

export function formatSandboxList(
  sandboxes: readonly SandboxMetadata[],
): CallToolResult {
  return jsonTextResult({ data: sandboxes.map(sandboxPayload) });
}

export function formatPreview(preview: PreviewMetadata): CallToolResult {
  return jsonTextResult(previewPayload(preview));
}

export function formatPreviewCreate(
  preview: PreviewMetadata,
  previewToken?: string,
): CallToolResult {
  return jsonTextResult({
    ...previewPayload(preview),
    preview_token: previewToken,
  });
}

export function formatPreviewList(
  sandboxId: string,
  previews: readonly PreviewMetadata[],
): CallToolResult {
  return jsonTextResult({
    data: previews.map(previewPayload),
    sandbox_id: sandboxId,
  });
}

export function formatCodeContext(context: CodeContextMetadata): CallToolResult {
  return jsonTextResult(codeContextPayload(context));
}

export function formatCodeContextList(
  sandboxId: string,
  contexts: readonly CodeContextMetadata[],
): CallToolResult {
  return jsonTextResult({
    data: contexts.map(codeContextPayload),
    sandbox_id: sandboxId,
  });
}

export function formatApiKey(apiKey: ApiKeyMetadata): CallToolResult {
  return jsonTextResult(apiKeyPayload(apiKey));
}

export function formatApiKeyList(apiKeys: readonly ApiKeyMetadata[]): CallToolResult {
  return jsonTextResult({ data: apiKeys.map(apiKeyPayload) });
}

export function formatProject(project: ProjectMetadata): CallToolResult {
  return jsonTextResult({
    created_at: project.createdAt,
    name: project.name,
    org_id: project.orgId,
    project_id: project.id,
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

function artifactPayload(artifact: ArtifactMetadata): Record<string, unknown> {
  return {
    artifact_id: artifact.id,
    content_type: artifact.contentType,
    created_at: artifact.createdAt,
    deleted_at: artifact.deletedAt,
    name: artifact.name,
    sandbox_id: artifact.sandboxId,
    size_bytes: artifact.sizeBytes,
    source_path: artifact.sourcePath,
  };
}

function sandboxPayload(sandbox: SandboxMetadata): Record<string, unknown> {
  return {
    created_at: sandbox.createdAt,
    destroyed_at: sandbox.destroyedAt,
    expires_at: sandbox.expiresAt,
    project_id: sandbox.projectId,
    sandbox_id: sandbox.id,
    status: sandbox.status,
    template: formatTemplate(sandbox),
    ttl_ms: sandbox.ttlMs,
  };
}

function previewPayload(preview: PreviewMetadata): Record<string, unknown> {
  return {
    auth_mode: preview.authMode,
    created_at: preview.createdAt,
    expires_at: preview.expiresAt,
    port: preview.port,
    preview_id: preview.id,
    revoked_at: preview.revokedAt,
    sandbox_id: preview.sandboxId,
    slug: preview.slug,
    url: preview.url,
  };
}

function codeContextPayload(context: CodeContextMetadata): Record<string, unknown> {
  return {
    code_context_id: context.id,
    created_at: context.createdAt,
    cwd: context.cwd,
    expires_at: context.expiresAt,
    is_default: context.isDefault,
    language: context.language,
    sandbox_id: context.sandboxId,
  };
}

function apiKeyPayload(apiKey: ApiKeyMetadata): Record<string, unknown> {
  return {
    api_key_id: apiKey.id,
    created_at: apiKey.createdAt,
    last4: apiKey.last4,
    last_used_at: apiKey.lastUsedAt,
    name: apiKey.name,
    prefix: apiKey.prefix,
    project_ids: apiKey.projectIds,
    revoked_at: apiKey.revokedAt,
    scopes: apiKey.scopes,
  };
}

function formatTemplate(sandbox: SandboxMetadata): string | undefined {
  if (sandbox.templateSlug === undefined) {
    return undefined;
  }

  if (sandbox.templateVersion === undefined) {
    return sandbox.templateSlug;
  }

  return `${sandbox.templateSlug}@${sandbox.templateVersion}`;
}

function splitLogLines(data: string): readonly string[] {
  const lines = data.split(/\r?\n/u);
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}
