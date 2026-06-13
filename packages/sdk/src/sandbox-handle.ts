import type {
  Artifact,
  CodeArtifactPolicy,
  CodeContextRef,
  CodeLanguage,
  CodeRunEvent,
  Command,
  CreateArtifactResponse,
  CreateCodeContextResponse,
  CreatePreviewResponse,
  DeleteCodeContextResponse,
  DeleteFileResponse,
  ExtendSandboxResponse,
  FileDownloadUrlResponse,
  FileEncoding,
  FileEntry,
  FileStat,
  GetSandboxResponse,
  ListArtifactsResponse,
  ListFilesResponse,
  ListPreviewsResponse,
  Preview,
  PreviewAuthMode,
  RunCodeResponse,
  RunCodeResult,
  Sandbox,
} from "@crownest/contracts";

import { base64ToBytes, bytesToBase64 } from "./byte-utils";
import { runCommandWithCallbacks } from "./command-stream";
import { cancelCommand, type RunCommandOptions, type Transport } from "./protocol";

export type SandboxHandle = Sandbox & {
  readonly artifacts: {
    create(input: {
      readonly idempotencyKey?: string;
      readonly name?: string;
      readonly path: string;
    }): Promise<Artifact>;
    list(): Promise<readonly Artifact[]>;
  };
  readonly code: {
    createContext(input?: CreateCodeContextInput): Promise<CodeContextRef>;
    deleteContext(contextId: `cctx_${string}`): Promise<CodeContextRef>;
    run(input: RunCodeInput): Promise<RunCodeResult>;
    runStream(input: RunCodeInput): AsyncIterable<CodeRunEvent>;
  };
  readonly commands: {
    cancel(
      commandId: `cmd_${string}`,
      input?: { readonly mode?: "force" | "graceful" },
    ): Promise<Command>;
    run(command: string, input?: RunCommandOptions): Promise<Command>;
    start(
      command: string,
      input?: Omit<RunCommandOptions, "collect" | "collectOn">,
    ): Promise<Command>;
  };
  readonly files: {
    delete(path: string): Promise<void>;
    downloadUrl(path: string): Promise<FileDownloadUrlResponse>;
    list(path?: string): Promise<readonly FileEntry[]>;
    mkdir(path: string, input?: { readonly parents?: boolean }): Promise<FileStat>;
    move(
      from: string,
      to: string,
      input?: { readonly overwrite?: boolean },
    ): Promise<FileStat>;
    read(path: string, input?: { readonly encoding?: FileEncoding }): Promise<string>;
    /**
     * Reads a small file as bytes through the direct base64 API. Direct payloads
     * are capped by the API's maxDirectFileReadBytes; use downloadUrl or
     * artifacts for larger files.
     */
    readBytes(path: string): Promise<Uint8Array>;
    stat(path: string): Promise<FileStat>;
    write(
      path: string,
      content: string,
      input?: {
        readonly createParents?: boolean;
        readonly encoding?: FileEncoding;
        readonly overwrite?: boolean;
      },
    ): Promise<FileStat>;
    /**
     * Writes a small file as bytes through the direct base64 API. Direct payloads
     * are capped by the API's maxDirectFileWriteBytes; use downloadUrl or
     * artifacts for larger files.
     */
    writeBytes(
      path: string,
      bytes: Uint8Array,
      input?: {
        readonly createParents?: boolean;
        readonly overwrite?: boolean;
      },
    ): Promise<FileStat>;
  };
  readonly previews: {
    create(input: {
      readonly authMode?: PreviewAuthMode;
      readonly port: number;
    }): Promise<CreatePreviewResponse>;
    list(): Promise<readonly Preview[]>;
  };
  extend(input: {
    readonly idempotencyKey?: string;
    readonly ttlMs: number;
  }): Promise<SandboxHandle>;
  kill(): Promise<SandboxHandle>;
};

export type CreateCodeContextInput = {
  readonly cwd?: string;
  readonly idempotencyKey?: string;
  readonly language?: CodeLanguage;
  readonly timeoutMs?: number;
};

export type RunCodeInput = {
  readonly artifactPolicy?: CodeArtifactPolicy;
  readonly code: string;
  readonly contextId?: `cctx_${string}`;
  readonly cwd?: string;
  readonly idempotencyKey?: string;
  readonly language?: CodeLanguage;
  readonly timeoutMs?: number;
};

export function createSandboxHandle(
  sandbox: Sandbox,
  transport: Transport,
): SandboxHandle {
  return {
    ...sandbox,
    artifacts: createSandboxArtifactsClient(sandbox.id, transport),
    code: createSandboxCodeClient(sandbox.id, transport),
    commands: createSandboxCommands(sandbox, transport),
    extend: async (input) => {
      const { idempotencyKey, ...body } = input;
      const response = await transport.request<ExtendSandboxResponse>(
        `/v1/sandboxes/${sandbox.id}/extend`,
        {
          body,
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
          idempotent: true,
          method: "POST",
        },
      );

      return createSandboxHandle(response.sandbox, transport);
    },
    files: createSandboxFilesClient(sandbox.id, transport),
    kill: async () => {
      const response = await transport.request<GetSandboxResponse>(
        `/v1/sandboxes/${sandbox.id}`,
        { method: "DELETE" },
      );

      return createSandboxHandle(response.sandbox, transport);
    },
    previews: createSandboxPreviewsClient(sandbox.id, transport),
  };
}

export function createSandboxPreviewsClient(
  sandboxId: `sbx_${string}`,
  transport: Transport,
): SandboxHandle["previews"] {
  return {
    async create(input) {
      const response = await transport.request<CreatePreviewResponse>(
        `/v1/sandboxes/${sandboxId}/previews`,
        { body: input, method: "POST" },
      );
      return response;
    },
    async list() {
      const response = await transport.request<ListPreviewsResponse>(
        `/v1/sandboxes/${sandboxId}/previews`,
        { method: "GET" },
      );
      return response.data;
    },
  };
}

export function createSandboxArtifactsClient(
  sandboxId: `sbx_${string}`,
  transport: Transport,
): SandboxHandle["artifacts"] {
  return {
    async create(input) {
      const { idempotencyKey, ...body } = input;
      const response = await transport.request<CreateArtifactResponse>(
        `/v1/sandboxes/${sandboxId}/artifacts`,
        {
          body,
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
          idempotent: true,
          method: "POST",
        },
      );
      return response.artifact;
    },
    async list() {
      const response = await transport.request<ListArtifactsResponse>(
        `/v1/sandboxes/${sandboxId}/artifacts`,
        { method: "GET" },
      );
      return response.data;
    },
  };
}

export function createSandboxCodeClient(
  sandboxId: `sbx_${string}`,
  transport: Transport,
): SandboxHandle["code"] {
  return {
    async createContext(input = {}) {
      const { idempotencyKey, ...body } = input;
      const response = await transport.request<CreateCodeContextResponse>(
        `/v1/sandboxes/${sandboxId}/code/contexts`,
        {
          body: { language: "python", ...body },
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
          idempotent: true,
          method: "POST",
        },
      );
      return response.context;
    },
    async deleteContext(contextId) {
      const response = await transport.request<DeleteCodeContextResponse>(
        `/v1/sandboxes/${sandboxId}/code/contexts/${contextId}`,
        { method: "DELETE" },
      );
      return response.context;
    },
    async run(input) {
      const { idempotencyKey, ...body } = input;
      const response = await transport.request<RunCodeResponse>(
        `/v1/sandboxes/${sandboxId}/code/runs`,
        {
          body: { language: "python", ...body },
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
          idempotent: true,
          method: "POST",
        },
      );
      return response.run;
    },
    runStream(input) {
      const { idempotencyKey, ...body } = input;
      return transport.streamSse<CodeRunEvent>(
        `/v1/sandboxes/${sandboxId}/code/runs/stream`,
        {
          body: { language: "python", ...body },
          ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
          idempotent: true,
          method: "POST",
        },
      );
    },
  };
}

function createSandboxCommands(
  sandbox: Sandbox,
  transport: Transport,
): SandboxHandle["commands"] {
  return {
    cancel(commandId, input = {}) {
      return cancelCommand(
        transport,
        commandId,
        input,
        `/v1/sandboxes/${sandbox.id}/commands/${commandId}/cancel`,
      );
    },
    run(command, input = {}) {
      return runCommandWithCallbacks(transport, sandbox.id, command, "run", input);
    },
    start(command, input = {}) {
      return runCommandWithCallbacks(transport, sandbox.id, command, "start", input);
    },
  };
}

export function createSandboxFilesClient(
  sandboxId: `sbx_${string}`,
  transport: Transport,
): SandboxHandle["files"] {
  return {
    async delete(path) {
      await transport.request<DeleteFileResponse>(
        `/v1/sandboxes/${sandboxId}/files?path=${encodeURIComponent(path)}`,
        { method: "DELETE" },
      );
    },
    downloadUrl(path) {
      return transport.request<FileDownloadUrlResponse>(
        `/v1/sandboxes/${sandboxId}/files/download-url`,
        { body: { path }, method: "POST" },
      );
    },
    async list(path = "/workspace") {
      const response = await transport.request<ListFilesResponse>(
        `/v1/sandboxes/${sandboxId}/files?path=${encodeURIComponent(path)}`,
        { method: "GET" },
      );
      return response.data;
    },
    async mkdir(path, input = {}) {
      const response = await transport.request<{ readonly file: FileStat }>(
        `/v1/sandboxes/${sandboxId}/files/mkdir`,
        { body: { path, ...input }, method: "POST" },
      );
      return response.file;
    },
    async move(from, to, input = {}) {
      const response = await transport.request<{ readonly file: FileStat }>(
        `/v1/sandboxes/${sandboxId}/files/move`,
        { body: { from, to, ...input }, method: "POST" },
      );
      return response.file;
    },
    read(path, input = {}) {
      return readSandboxFile(sandboxId, transport, path, input);
    },
    async readBytes(path) {
      const content = await readSandboxFile(sandboxId, transport, path, {
        encoding: "base64",
      });
      return base64ToBytes(content);
    },
    async stat(path) {
      const response = await transport.request<{ readonly file: FileStat }>(
        `/v1/sandboxes/${sandboxId}/files/stat?path=${encodeURIComponent(path)}`,
        { method: "GET" },
      );
      return response.file;
    },
    write(path, content, input = {}) {
      return writeSandboxFile(sandboxId, transport, path, content, input);
    },
    writeBytes(path, bytes, input = {}) {
      return writeSandboxFile(sandboxId, transport, path, bytesToBase64(bytes), {
        ...input,
        encoding: "base64",
      });
    },
  };
}

async function readSandboxFile(
  sandboxId: `sbx_${string}`,
  transport: Transport,
  path: string,
  input: { readonly encoding?: FileEncoding } = {},
): Promise<string> {
  const response = await transport.request<{
    readonly content: string;
    readonly encoding: FileEncoding;
  }>(readFilePath(sandboxId, path, input.encoding), { method: "GET" });
  return response.content;
}

async function writeSandboxFile(
  sandboxId: `sbx_${string}`,
  transport: Transport,
  path: string,
  content: string,
  input: {
    readonly createParents?: boolean;
    readonly encoding?: FileEncoding;
    readonly overwrite?: boolean;
  } = {},
): Promise<FileStat> {
  const response = await transport.request<{ readonly file: FileStat }>(
    `/v1/sandboxes/${sandboxId}/files`,
    { body: { content, path, ...input }, method: "PUT" },
  );
  return response.file;
}

function readFilePath(
  sandboxId: `sbx_${string}`,
  path: string,
  encoding?: FileEncoding,
): string {
  const encodedPath = encodeURIComponent(path);
  const encodingParam =
    encoding === undefined ? "" : `&encoding=${encodeURIComponent(encoding)}`;

  return `/v1/sandboxes/${sandboxId}/files/read?path=${encodedPath}${encodingParam}`;
}
