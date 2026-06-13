import type {
  Artifact,
  ArtifactDownloadUrlResponse,
  CodeArtifactPolicy,
  CodeContextRef,
  CodeLanguage,
  CodeRunEvent,
  Command,
  CommandLogChunk,
  CommandLogStreamEvent,
  CreatePreviewResponse,
  FileDownloadUrlResponse,
  FileEncoding,
  FileEntry,
  FileStat,
  Preview,
  PreviewAuthMode,
  Project,
  RunCodeResult,
  Sandbox,
  UsageSummaryResponse,
} from "@crownest/contracts";

import type { RunCommandOptions } from "./protocol";
import type {
  CreateCodeContextInput,
  RunCodeInput,
  SandboxHandle,
} from "./sandbox-handle";

export type { CodeArtifactPolicy, CodeLanguage };

export type CreateSandboxInput = {
  readonly idempotencyKey?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly projectId?: `prj_${string}`;
  readonly restoreFrom?: `bkp_${string}`;
  readonly template?: string;
  readonly templateVersionId?: `tplv_${string}`;
  readonly ttlMs?: number;
};

export type ExtendSandboxInput = {
  readonly idempotencyKey?: string;
  readonly ttlMs: number;
};

export type ListSandboxesInput = {
  readonly metadata?: Readonly<Record<string, string>>;
};

export type CrowNestClient = {
  readonly artifacts: {
    create(
      sandboxId: `sbx_${string}`,
      input: {
        readonly idempotencyKey?: string;
        readonly name?: string;
        readonly path: string;
      },
    ): Promise<Artifact>;
    delete(artifactId: `art_${string}`): Promise<Artifact>;
    download(artifactId: `art_${string}`): Promise<Uint8Array>;
    downloadUrl(artifactId: `art_${string}`): Promise<ArtifactDownloadUrlResponse>;
    get(artifactId: `art_${string}`): Promise<Artifact>;
    list(sandboxId: `sbx_${string}`): Promise<readonly Artifact[]>;
  };
  readonly commands: {
    cancel(
      commandId: `cmd_${string}`,
      input?: { readonly mode?: "force" | "graceful" },
    ): Promise<Command>;
    get(commandId: `cmd_${string}`): Promise<Command>;
    logs(
      commandId: `cmd_${string}`,
      input?: { readonly afterSeq?: number; readonly limit?: number },
    ): Promise<readonly CommandLogChunk[]>;
    run(
      sandboxId: `sbx_${string}`,
      command: string,
      input?: RunCommandOptions,
    ): Promise<Command>;
    start(
      sandboxId: `sbx_${string}`,
      command: string,
      input?: Omit<RunCommandOptions, "collect" | "collectOn">,
    ): Promise<Command>;
    streamLogs(
      commandId: `cmd_${string}`,
      input?: { readonly afterSeq?: number; readonly reconnect?: boolean },
    ): AsyncIterable<CommandLogStreamEvent>;
  };
  readonly code: {
    createContext(
      sandboxId: `sbx_${string}`,
      input?: CreateCodeContextInput,
    ): Promise<CodeContextRef>;
    deleteContext(
      sandboxId: `sbx_${string}`,
      contextId: `cctx_${string}`,
    ): Promise<CodeContextRef>;
    run(sandboxId: `sbx_${string}`, input: RunCodeInput): Promise<RunCodeResult>;
    runStream(
      sandboxId: `sbx_${string}`,
      input: RunCodeInput,
    ): AsyncIterable<CodeRunEvent>;
  };
  readonly files: {
    delete(sandboxId: `sbx_${string}`, path: string): Promise<void>;
    downloadUrl(
      sandboxId: `sbx_${string}`,
      path: string,
    ): Promise<FileDownloadUrlResponse>;
    list(sandboxId: `sbx_${string}`, path?: string): Promise<readonly FileEntry[]>;
    mkdir(
      sandboxId: `sbx_${string}`,
      path: string,
      input?: { readonly parents?: boolean },
    ): Promise<FileStat>;
    move(
      sandboxId: `sbx_${string}`,
      from: string,
      to: string,
      input?: { readonly overwrite?: boolean },
    ): Promise<FileStat>;
    read(
      sandboxId: `sbx_${string}`,
      path: string,
      input?: { readonly encoding?: FileEncoding },
    ): Promise<string>;
    /**
     * Reads a small file as bytes through the direct base64 API. Direct payloads
     * are capped by the API's maxDirectFileReadBytes; use downloadUrl or
     * artifacts for larger files.
     */
    readBytes(sandboxId: `sbx_${string}`, path: string): Promise<Uint8Array>;
    stat(sandboxId: `sbx_${string}`, path: string): Promise<FileStat>;
    write(
      sandboxId: `sbx_${string}`,
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
      sandboxId: `sbx_${string}`,
      path: string,
      bytes: Uint8Array,
      input?: {
        readonly createParents?: boolean;
        readonly overwrite?: boolean;
      },
    ): Promise<FileStat>;
  };
  readonly previews: {
    create(
      sandboxId: `sbx_${string}`,
      input: { readonly authMode?: PreviewAuthMode; readonly port: number },
    ): Promise<CreatePreviewResponse>;
    get(previewId: `prv_${string}`): Promise<Preview>;
    list(sandboxId: `sbx_${string}`): Promise<readonly Preview[]>;
    revoke(previewId: `prv_${string}`): Promise<Preview>;
  };
  readonly projects: {
    list(): Promise<readonly Project[]>;
  };
  readonly sandboxes: {
    create(input?: CreateSandboxInput): Promise<SandboxHandle>;
    extend(
      sandboxId: `sbx_${string}`,
      input: ExtendSandboxInput,
    ): Promise<SandboxHandle>;
    get(sandboxId: `sbx_${string}`): Promise<SandboxHandle>;
    kill(sandboxId: `sbx_${string}`): Promise<Sandbox>;
    list(input?: ListSandboxesInput): Promise<readonly Sandbox[]>;
  };
  usage(): Promise<UsageSummaryResponse>;
};
