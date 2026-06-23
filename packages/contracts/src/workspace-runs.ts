export type WorkspaceRunStatus =
  | "awaiting_archive"
  | "archive_uploaded"
  | "starting"
  | "extracting"
  | "running"
  | "collecting"
  | "succeeded"
  | "failed"
  | "canceled";

export type WorkspaceRunFailureReason =
  | "archive_invalid"
  | "archive_too_large"
  | "command_exit"
  | "extraction_failed"
  | "internal_error"
  | "sandbox_conflict"
  | "sandbox_unavailable"
  | "timeout"
  | "upload_missing";

export type WorkspaceRunFailureClass =
  | "canceled"
  | "platform"
  | "user_command"
  | "user_input";

export type WorkspaceRunCleanupStatus =
  | "failed"
  | "not_requested"
  | "pending"
  | "succeeded";

export type WorkspaceRunArchiveTransferStatus =
  | "expired"
  | "finalized"
  | "pending"
  | "uploaded";

export type WorkspaceRunArchive = {
  readonly sha256: string;
  readonly sizeBytes: number;
  readonly uploadedAt?: string;
};

export type WorkspaceRunSourceMetadata = Readonly<Record<string, string>>;

export type WorkspaceRunArtifactRequest = {
  readonly name?: string;
  readonly path: string;
};

export type WorkspaceRunArtifactError = {
  readonly code:
    | "artifact_collect_failed"
    | "file_not_found"
    | "path_outside_workspace";
  readonly message: string;
  readonly path: string;
};

export type WorkspaceRun = {
  readonly id: `wsr_${string}`;
  readonly orgId: `org_${string}`;
  readonly projectId: `prj_${string}`;
  readonly status: WorkspaceRunStatus;
  readonly command: string;
  readonly keepSandbox: boolean;
  readonly metadata: Readonly<Record<string, string>>;
  readonly templateId: `tpl_${string}`;
  readonly templateSlug: string;
  readonly templateVersion: string;
  readonly templateVersionId: `tplv_${string}`;
  readonly archive?: WorkspaceRunArchive;
  readonly artifactErrors?: readonly WorkspaceRunArtifactError[];
  readonly artifactIds?: readonly `art_${string}`[];
  readonly cleanupStatus?: WorkspaceRunCleanupStatus;
  readonly commandId?: `cmd_${string}`;
  readonly createdAt: string;
  readonly durationMs?: number;
  readonly envKeys?: readonly string[];
  readonly evidenceAvailable?: boolean;
  readonly exitCode?: number;
  readonly failureClass?: WorkspaceRunFailureClass;
  readonly failureReason?: WorkspaceRunFailureReason;
  readonly finishedAt?: string;
  readonly orchestrationSucceeded?: boolean;
  readonly sandboxId?: `sbx_${string}`;
  readonly sourceMetadata?: WorkspaceRunSourceMetadata;
  readonly startedAt?: string;
  readonly timeoutMs?: number;
  readonly uploadedAt?: string;
};

export type WorkspaceRunEvidenceBundle = {
  readonly workspaceRunId: `wsr_${string}`;
  readonly orgId: `org_${string}`;
  readonly projectId: `prj_${string}`;
  readonly status: WorkspaceRunStatus;
  readonly archive?: WorkspaceRunArchive;
  readonly artifactErrors: readonly WorkspaceRunArtifactError[];
  readonly artifactIds: readonly `art_${string}`[];
  readonly cleanupStatus: WorkspaceRunCleanupStatus;
  readonly command: string;
  readonly commandId?: `cmd_${string}`;
  readonly createdAt: string;
  readonly durationMs?: number;
  readonly envKeys: readonly string[];
  readonly exitCode?: number;
  readonly failureClass?: WorkspaceRunFailureClass;
  readonly failureReason?: WorkspaceRunFailureReason;
  readonly finishedAt?: string;
  readonly metadata: Readonly<Record<string, string>>;
  readonly orchestrationSucceeded: boolean;
  readonly sandboxId?: `sbx_${string}`;
  readonly sourceMetadata?: WorkspaceRunSourceMetadata;
  readonly startedAt?: string;
  readonly timeoutMs?: number;
};

export type WorkspaceRunStreamEvent =
  | {
      readonly createdAt: string;
      readonly seq: number;
      readonly status: WorkspaceRunStatus;
      readonly type: "status";
    }
  | {
      readonly createdAt: string;
      readonly receivedBytes: number;
      readonly seq: number;
      readonly sizeBytes?: number;
      readonly type: "archive_progress";
    }
  | {
      readonly createdAt: string;
      readonly data: string;
      readonly seq: number;
      readonly type: "stdout" | "stderr";
    }
  | {
      readonly artifactId: `art_${string}`;
      readonly createdAt: string;
      readonly path: string;
      readonly seq: number;
      readonly type: "artifact_collected";
    }
  | {
      readonly createdAt: string;
      readonly error: WorkspaceRunArtifactError;
      readonly seq: number;
      readonly type: "artifact_error";
    }
  | {
      readonly createdAt: string;
      readonly seq: number;
      readonly type: "heartbeat";
    }
  | {
      readonly createdAt: string;
      readonly seq: number;
      readonly type: "terminal";
      readonly workspaceRun: WorkspaceRun;
    }
  | {
      readonly code: string;
      readonly createdAt: string;
      readonly message: string;
      readonly seq: number;
      readonly type: "error";
    };
