import {
  createCrowNestClient,
  type CrowNestClient,
  type SandboxHandle,
} from "@crownest/sdk";

type WorkspaceRunArchiveTransfer = Awaited<
  ReturnType<CrowNestClient["workspaceRuns"]["createArchiveTransfer"]>
>;

export type McpSessionConfig = {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly client?: CrowNestClient;
};

export type McpSessionSnapshot = {
  readonly defaultSandboxId?: `sbx_${string}`;
  readonly sandboxIds: readonly `sbx_${string}`[];
};

export class McpSessionError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "McpSessionError";
    this.code = code;
  }
}

export class McpSession {
  readonly client: CrowNestClient;
  private defaultSandboxId: `sbx_${string}` | undefined;
  private defaultSandboxCreation: Promise<SandboxHandle> | undefined;
  private readonly ownedSandboxIds = new Set<`sbx_${string}`>();
  private readonly sandboxes = new Map<`sbx_${string}`, SandboxHandle>();
  private readonly workspaceRunArchiveTransfers = new Map<
    `upl_${string}`,
    WorkspaceRunArchiveTransfer
  >();

  constructor(config: McpSessionConfig) {
    this.client =
      config.client ??
      createCrowNestClient({
        apiKey: config.apiKey,
        ...(config.baseUrl === undefined ? {} : { baseUrl: config.baseUrl }),
      });
  }

  async createSandbox(input: { readonly ttlMs?: number } = {}): Promise<SandboxHandle> {
    const sandbox = await this.client.sandboxes.create(input);
    this.trackSandbox(sandbox, "owned");
    return sandbox;
  }

  async resolveSandbox(sandboxId?: `sbx_${string}`): Promise<SandboxHandle> {
    if (sandboxId === undefined) {
      return this.resolveDefaultSandbox();
    }

    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox !== undefined) {
      return sandbox;
    }

    const adopted = await this.client.sandboxes.get(sandboxId);
    this.trackSandbox(adopted, "adopted");
    return adopted;
  }

  rememberWorkspaceRunArchiveTransfer(transfer: WorkspaceRunArchiveTransfer): void {
    this.workspaceRunArchiveTransfers.set(transfer.id, transfer);
  }

  resolveWorkspaceRunArchiveTransfer(
    uploadId: `upl_${string}`,
  ): WorkspaceRunArchiveTransfer {
    const transfer = this.workspaceRunArchiveTransfers.get(uploadId);
    if (transfer === undefined) {
      throw new McpSessionError(
        "unknown_workspace_run_archive_transfer",
        `Unknown Workspace Run archive transfer id ${uploadId}. Create the transfer with this MCP server session before uploading archive bytes.`,
      );
    }

    return transfer;
  }

  async resolveDefaultSandbox(): Promise<SandboxHandle> {
    if (this.defaultSandboxId !== undefined) {
      const sandbox = this.sandboxes.get(this.defaultSandboxId);
      if (sandbox !== undefined) {
        if (!canReuseDefaultSandbox(sandbox)) {
          this.sandboxes.delete(sandbox.id);
          this.ownedSandboxIds.delete(sandbox.id);
          this.defaultSandboxId = undefined;
        } else {
          return sandbox;
        }
      }
    }

    if (this.defaultSandboxCreation !== undefined) {
      return this.defaultSandboxCreation;
    }

    this.defaultSandboxCreation = this.createSandbox()
      .then((sandbox) => {
        this.defaultSandboxId = sandbox.id;
        return sandbox;
      })
      .finally(() => {
        this.defaultSandboxCreation = undefined;
      });

    return this.defaultSandboxCreation;
  }

  rememberSandbox(sandbox: SandboxHandle): void {
    const ownership =
      this.ownedSandboxIds.has(sandbox.id) || this.defaultSandboxId === sandbox.id
        ? "owned"
        : "adopted";
    this.trackSandbox(sandbox, ownership);
  }

  refreshTrackedSandbox(sandbox: SandboxHandle): boolean {
    if (!this.sandboxes.has(sandbox.id)) {
      return false;
    }

    this.trackSandbox(
      sandbox,
      this.ownedSandboxIds.has(sandbox.id) ? "owned" : "adopted",
    );
    return true;
  }

  snapshot(): McpSessionSnapshot {
    return {
      ...(this.defaultSandboxId === undefined
        ? {}
        : { defaultSandboxId: this.defaultSandboxId }),
      sandboxIds: [...this.sandboxes.keys()],
    };
  }

  async killSandbox(sandboxId: `sbx_${string}`): Promise<void> {
    const sandbox = await this.resolveSandbox(sandboxId);
    await sandbox.kill();
    this.sandboxes.delete(sandboxId);
    this.ownedSandboxIds.delete(sandboxId);
    if (this.defaultSandboxId === sandboxId) {
      this.defaultSandboxId = undefined;
      this.defaultSandboxCreation = undefined;
    }
  }

  async cleanup(): Promise<void> {
    if (this.defaultSandboxCreation !== undefined) {
      await Promise.allSettled([this.defaultSandboxCreation]);
    }

    const sandboxes = [...this.ownedSandboxIds]
      .map((sandboxId) => this.sandboxes.get(sandboxId))
      .filter((sandbox): sandbox is SandboxHandle => sandbox !== undefined);
    this.sandboxes.clear();
    this.ownedSandboxIds.clear();
    this.workspaceRunArchiveTransfers.clear();
    this.defaultSandboxId = undefined;
    this.defaultSandboxCreation = undefined;
    await Promise.allSettled(sandboxes.map((sandbox) => sandbox.kill()));
  }

  private trackSandbox(sandbox: SandboxHandle, ownership: "adopted" | "owned"): void {
    this.sandboxes.set(sandbox.id, sandbox);
    if (ownership === "owned") {
      this.ownedSandboxIds.add(sandbox.id);
    }
  }
}

function canReuseDefaultSandbox(sandbox: SandboxHandle): boolean {
  return (
    sandbox.status !== "destroyed" &&
    sandbox.status !== "failed" &&
    new Date(sandbox.expiresAt).getTime() > Date.now()
  );
}

export function loadSessionConfig(
  env: NodeJS.ProcessEnv = process.env,
): McpSessionConfig {
  const apiKey = env.CROWNEST_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) {
    throw new Error("CrowNest API key missing. Set CROWNEST_API_KEY.");
  }

  return {
    apiKey,
    ...(env.CROWNEST_API_URL === undefined ? {} : { baseUrl: env.CROWNEST_API_URL }),
  };
}
