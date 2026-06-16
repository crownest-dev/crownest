import type {
  ApiKey,
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

export type CreateProjectInput = {
  readonly name: string;
};

export type CrowNestClient = {
  readonly apiKeys: {
    /** Retrieve API Key metadata by id. */
    get(apiKeyId: `key_${string}`): Promise<ApiKey>;
    /** List API Key metadata visible to the configured credential. */
    list(): Promise<readonly ApiKey[]>;
    /** Revoke an API Key immediately. */
    revoke(apiKeyId: `key_${string}`): Promise<ApiKey>;
  };
  readonly artifacts: {
    /** Export a Workspace file from a Sandbox as a durable Artifact. */
    create(
      sandboxId: `sbx_${string}`,
      input: {
        readonly idempotencyKey?: string;
        readonly name?: string;
        readonly path: string;
      },
    ): Promise<Artifact>;
    /** Delete an Artifact by id. */
    delete(artifactId: `art_${string}`): Promise<Artifact>;
    /** Download Artifact bytes. */
    download(artifactId: `art_${string}`): Promise<Uint8Array>;
    /** Create or reuse a short-lived Artifact download URL. */
    downloadUrl(artifactId: `art_${string}`): Promise<ArtifactDownloadUrlResponse>;
    /** Retrieve Artifact metadata by id. */
    get(artifactId: `art_${string}`): Promise<Artifact>;
    /** List Artifacts exported from a Sandbox. */
    list(sandboxId: `sbx_${string}`): Promise<readonly Artifact[]>;
  };
  readonly commands: {
    /** Cancel a running Command. */
    cancel(
      commandId: `cmd_${string}`,
      input?: { readonly mode?: "force" | "graceful" },
    ): Promise<Command>;
    /** Retrieve Command metadata by id. */
    get(commandId: `cmd_${string}`): Promise<Command>;
    /** Read bounded Command log chunks. */
    logs(
      commandId: `cmd_${string}`,
      input?: { readonly afterSeq?: number; readonly limit?: number },
    ): Promise<readonly CommandLogChunk[]>;
    /** Run a Command in a Sandbox and wait for completion. */
    run(
      sandboxId: `sbx_${string}`,
      command: string,
      input?: RunCommandOptions,
    ): Promise<Command>;
    /** Start a Command in a Sandbox without waiting for completion. */
    start(
      sandboxId: `sbx_${string}`,
      command: string,
      input?: Omit<RunCommandOptions, "collect" | "collectOn">,
    ): Promise<Command>;
    /** Stream Command log events with optional reconnect support. */
    streamLogs(
      commandId: `cmd_${string}`,
      input?: { readonly afterSeq?: number; readonly reconnect?: boolean },
    ): AsyncIterable<CommandLogStreamEvent>;
  };
  readonly code: {
    /** Create a Code Context in a Sandbox. */
    createContext(
      sandboxId: `sbx_${string}`,
      input?: CreateCodeContextInput,
    ): Promise<CodeContextRef>;
    /** Delete a Code Context from a Sandbox. */
    deleteContext(
      sandboxId: `sbx_${string}`,
      contextId: `cctx_${string}`,
    ): Promise<CodeContextRef>;
    /** Retrieve Code Context metadata. */
    getContext(
      sandboxId: `sbx_${string}`,
      contextId: `cctx_${string}`,
    ): Promise<CodeContextRef>;
    /** List Code Contexts in a Sandbox. */
    listContexts(sandboxId: `sbx_${string}`): Promise<readonly CodeContextRef[]>;
    /** Run interpreter code in a Sandbox. */
    run(sandboxId: `sbx_${string}`, input: RunCodeInput): Promise<RunCodeResult>;
    /** Stream interpreter code execution events. */
    runStream(
      sandboxId: `sbx_${string}`,
      input: RunCodeInput,
    ): AsyncIterable<CodeRunEvent>;
  };
  readonly files: {
    /** Delete a Workspace file or empty directory. */
    delete(sandboxId: `sbx_${string}`, path: string): Promise<void>;
    /** Create or reuse a short-lived download URL for a Workspace file. */
    downloadUrl(
      sandboxId: `sbx_${string}`,
      path: string,
    ): Promise<FileDownloadUrlResponse>;
    /** List entries in a Workspace directory. */
    list(sandboxId: `sbx_${string}`, path?: string): Promise<readonly FileEntry[]>;
    /** Create a Workspace directory. */
    mkdir(
      sandboxId: `sbx_${string}`,
      path: string,
      input?: { readonly parents?: boolean },
    ): Promise<FileStat>;
    /** Move or rename a Workspace file or directory. */
    move(
      sandboxId: `sbx_${string}`,
      from: string,
      to: string,
      input?: { readonly overwrite?: boolean },
    ): Promise<FileStat>;
    /** Read a small Workspace file as text. */
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
    /** Inspect Workspace file metadata. */
    stat(sandboxId: `sbx_${string}`, path: string): Promise<FileStat>;
    /** Write a small Workspace text file. */
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
    /** Create a Preview for a Sandbox port. */
    create(
      sandboxId: `sbx_${string}`,
      input: { readonly authMode?: PreviewAuthMode; readonly port: number },
    ): Promise<CreatePreviewResponse>;
    /** Retrieve Preview metadata by id. */
    get(previewId: `prv_${string}`): Promise<Preview>;
    /** List Previews for a Sandbox. */
    list(sandboxId: `sbx_${string}`): Promise<readonly Preview[]>;
    /** Revoke a Preview by id. */
    revoke(previewId: `prv_${string}`): Promise<Preview>;
  };
  readonly projects: {
    /** Create a Project in the configured organization. */
    create(input: CreateProjectInput): Promise<Project>;
    /** List Projects visible to the configured credential. */
    list(): Promise<readonly Project[]>;
  };
  readonly sandboxes: {
    /** Create a live Sandbox. */
    create(input?: CreateSandboxInput): Promise<SandboxHandle>;
    /** Reset a live Sandbox TTL from now. */
    extend(
      sandboxId: `sbx_${string}`,
      input: ExtendSandboxInput,
    ): Promise<SandboxHandle>;
    /** Retrieve a Sandbox by id. */
    get(sandboxId: `sbx_${string}`): Promise<SandboxHandle>;
    /** Kill a live Sandbox. */
    kill(sandboxId: `sbx_${string}`): Promise<Sandbox>;
    /** List live Sandboxes visible to the configured credential. */
    list(input?: ListSandboxesInput): Promise<readonly Sandbox[]>;
  };
  /** Read current compute usage, credits, and quota buckets. */
  usage(): Promise<UsageSummaryResponse>;
};
