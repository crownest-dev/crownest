import type {
  ApiKey,
  ApiKeyScope,
  Artifact,
  CodeArtifactPolicy,
  CodeContextRef,
  CodeLanguage,
  Command,
  CommandCancelMode,
  CommandCollectOn,
  CommandCollectRequest,
  CommandLogChunk,
  FileEncoding,
  FileEntry,
  FileStat,
  Metadata,
  Preview,
  PreviewAuthMode,
  Project,
  RunCodeResult,
  Sandbox,
  UsageEvent,
} from "./public-resources";

export type ApiErrorResponse = {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: Readonly<Record<string, unknown>>;
  };
};

export type Pagination<T> = {
  readonly data: readonly T[];
  readonly hasMore: boolean;
  readonly nextCursor?: string;
};

export type CreateSandboxBody = {
  readonly metadata?: Metadata;
  readonly projectId?: `prj_${string}`;
  readonly restoreFrom?: `bkp_${string}`;
  readonly template?: string;
  readonly templateVersionId?: `tplv_${string}`;
  readonly ttlMs?: number;
};

export type CreateSandboxResponse = {
  readonly sandbox: Sandbox;
};

export type ExtendSandboxBody = {
  readonly ttlMs: number;
};

export type ExtendSandboxResponse = {
  readonly sandbox: Sandbox;
};

export type ListSandboxesResponse = Pagination<Sandbox>;

export type GetSandboxResponse = {
  readonly sandbox: Sandbox;
};

export type KillSandboxResponse = {
  readonly sandbox: Sandbox;
};

export type RunCommandBody = {
  readonly collect?: readonly CommandCollectRequest[];
  readonly collectOn?: CommandCollectOn;
  readonly command: string;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
};

export type RunCommandResponse = {
  readonly command: Command;
};

export type GetCommandResponse = {
  readonly command: Command;
};

export type CancelCommandBody = {
  readonly mode?: CommandCancelMode;
};

export type CancelCommandResponse = {
  readonly command: Command;
};

export type ListCommandLogsResponse = {
  readonly data: readonly CommandLogChunk[];
  readonly hasMore: boolean;
  readonly nextSeq?: number;
};

export type CommandLogStreamEvent =
  | {
      readonly createdAt: string;
      readonly data: string;
      readonly seq: number;
      readonly stream: "stderr" | "stdout";
      readonly type: "log";
    }
  | {
      readonly createdAt: string;
      readonly type: "heartbeat";
    }
  | {
      readonly command: Command;
      readonly createdAt: string;
      readonly type: "terminal";
    }
  | {
      readonly code: string;
      readonly createdAt: string;
      readonly message: string;
      readonly type: "error";
    };

export type CommandLogsDownloadUrlResponse = {
  readonly expiresAt: string;
  readonly method: "GET";
  readonly url: string;
};

export type CreateCodeContextBody = {
  readonly cwd?: string;
  readonly language: CodeLanguage;
  readonly timeoutMs?: number;
};

export type CreateCodeContextResponse = {
  readonly context: CodeContextRef;
};

export type DeleteCodeContextResponse = {
  readonly context: CodeContextRef;
};

export type RunCodeBody = {
  readonly artifactPolicy?: CodeArtifactPolicy;
  readonly code: string;
  readonly contextId?: `cctx_${string}`;
  readonly cwd?: string;
  readonly language: CodeLanguage;
  readonly timeoutMs?: number;
};

export type RunCodeResponse = {
  readonly run: RunCodeResult;
};

export type ListFilesResponse = {
  readonly data: readonly FileEntry[];
};

export type StatFileResponse = {
  readonly file: FileStat;
};

export type ReadFileResponse = {
  readonly content: string;
  readonly encoding: FileEncoding;
};

export type WriteFileBody = {
  readonly content: string;
  readonly createParents?: boolean;
  readonly encoding?: FileEncoding;
  readonly overwrite?: boolean;
  readonly path: string;
};

export type WriteFileResponse = {
  readonly file: FileStat;
};

export type DeleteFileResponse = {
  readonly deleted: true;
};

export type MkdirBody = {
  readonly parents?: boolean;
  readonly path: string;
};

export type MoveFileBody = {
  readonly from: string;
  readonly overwrite?: boolean;
  readonly to: string;
};

export type FileDownloadUrlResponse = {
  readonly authMode: "api_key";
  readonly method: "GET";
  readonly url: string;
};

export type CreateArtifactBody = {
  readonly name?: string;
  readonly path: string;
};

export type CreateArtifactResponse = {
  readonly artifact: Artifact;
};

export type ListArtifactsResponse = Pagination<Artifact>;

export type GetArtifactResponse = {
  readonly artifact: Artifact;
};

export type ArtifactDownloadUrlResponse = {
  readonly authMode: "api_key";
  readonly headers: Readonly<Record<string, string>>;
  readonly method: "GET";
  readonly url: string;
};

export type DeleteArtifactResponse = {
  readonly artifact: Artifact;
};

export type CreatePreviewBody = {
  readonly authMode?: PreviewAuthMode;
  readonly port: number;
};

export type CreatePreviewResponse = {
  readonly preview: Preview;
  readonly previewToken?: string;
};

export type ListPreviewsResponse = Pagination<Preview>;

export type GetPreviewResponse = {
  readonly preview: Preview;
};

export type DeletePreviewResponse = {
  readonly preview: Preview;
};

export type CreateApiKeyBody = {
  readonly name: string;
  readonly projectIds?: readonly `prj_${string}`[];
  readonly scopes: readonly ApiKeyScope[];
};

export type CreateApiKeyResponse = {
  readonly apiKey: ApiKey;
  readonly secret: string;
};

export type ListApiKeysResponse = Pagination<ApiKey>;

export type BootstrapResponse = {
  readonly apiKeys: readonly ApiKey[];
  readonly project: Project;
};

export type ListProjectsResponse = Pagination<Project>;

export type UsageQuotaBucket = {
  readonly current?: number;
  readonly limit: number;
  readonly remaining?: number;
  readonly resetAt?: string | null;
};

export type UsageSummaryResponse = {
  readonly period: {
    readonly end: string;
    readonly resetAt: string;
    readonly start: string;
  };
  readonly pricingVersion: string;
  readonly computeUnitSecondsPerCredit: number;
  readonly computeUnitSeconds: {
    readonly used: number;
  };
  readonly credits: {
    readonly used: number;
    readonly remaining?: number;
  };
  readonly quotas: Readonly<Record<string, UsageQuotaBucket>>;
  readonly events?: readonly UsageEvent[];
};
