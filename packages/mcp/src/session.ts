import {
  createCrowNestClient,
  type CrowNestClient,
  type SandboxHandle,
} from "@crownest/sdk";

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
  private readonly sandboxes = new Map<`sbx_${string}`, SandboxHandle>();

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
    this.trackSandbox(sandbox);
    return sandbox;
  }

  async resolveSandbox(sandboxId?: `sbx_${string}`): Promise<SandboxHandle> {
    if (sandboxId === undefined) {
      return this.resolveDefaultSandbox();
    }

    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox === undefined) {
      throw unknownSandboxError(sandboxId);
    }
    return sandbox;
  }

  async resolveDefaultSandbox(): Promise<SandboxHandle> {
    if (this.defaultSandboxId !== undefined) {
      const sandbox = this.sandboxes.get(this.defaultSandboxId);
      if (sandbox !== undefined) {
        if (!canReuseDefaultSandbox(sandbox)) {
          this.sandboxes.delete(sandbox.id);
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
    this.trackSandbox(sandbox);
  }

  refreshTrackedSandbox(sandbox: SandboxHandle): boolean {
    if (!this.sandboxes.has(sandbox.id)) {
      return false;
    }

    this.trackSandbox(sandbox);
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
    const sandbox = this.sandboxes.get(sandboxId);
    if (sandbox === undefined) {
      throw unknownSandboxError(sandboxId);
    }

    await sandbox.kill();
    this.sandboxes.delete(sandboxId);
    if (this.defaultSandboxId === sandboxId) {
      this.defaultSandboxId = undefined;
      this.defaultSandboxCreation = undefined;
    }
  }

  async cleanup(): Promise<void> {
    if (this.defaultSandboxCreation !== undefined) {
      await Promise.allSettled([this.defaultSandboxCreation]);
    }

    const sandboxes = [...this.sandboxes.values()];
    this.sandboxes.clear();
    this.defaultSandboxId = undefined;
    this.defaultSandboxCreation = undefined;
    await Promise.allSettled(sandboxes.map((sandbox) => sandbox.kill()));
  }

  private trackSandbox(sandbox: SandboxHandle): void {
    this.sandboxes.set(sandbox.id, sandbox);
  }
}

function unknownSandboxError(sandboxId: `sbx_${string}`): McpSessionError {
  return new McpSessionError(
    "unknown_sandbox_id",
    `Unknown Sandbox id ${sandboxId}. This Sandbox was not created by this MCP server session or has already been killed.`,
  );
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
