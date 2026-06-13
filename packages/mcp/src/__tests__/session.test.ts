import type { CrowNestClient, SandboxHandle } from "@crownest/sdk";
import type { Mock } from "vitest";
import { describe, expect, it, vi } from "vitest";

import { loadSessionConfig, McpSession } from "../session";

type TestClient = CrowNestClient & {
  readonly mocks: {
    readonly createSandbox: Mock;
  };
};

type TestSandbox = SandboxHandle & {
  readonly mocks: {
    readonly kill: Mock;
  };
};

describe("loadSessionConfig", () => {
  it("fails fast when CROWNEST_API_KEY is missing", () => {
    expect(() => loadSessionConfig({})).toThrow(
      "CrowNest API key missing. Set CROWNEST_API_KEY.",
    );
    expect(() => loadSessionConfig({ CROWNEST_API_KEY: "" })).toThrow(
      "CrowNest API key missing. Set CROWNEST_API_KEY.",
    );
  });

  it("reads API key and optional API URL from the host environment", () => {
    expect(
      loadSessionConfig({
        CROWNEST_API_KEY: "cn_test",
        CROWNEST_API_URL: "https://api.test",
      }),
    ).toEqual({
      apiKey: "cn_test",
      baseUrl: "https://api.test",
    });
  });
});

describe("McpSession default Sandbox", () => {
  it("creates one default Sandbox and reuses it", async () => {
    const sandbox = createSandboxHandle("sbx_default");
    const client = createClient([sandbox]);
    const session = new McpSession({ apiKey: "cn_test", client });

    await expect(session.resolveSandbox()).resolves.toBe(sandbox);
    await expect(session.resolveSandbox()).resolves.toBe(sandbox);
    expect(client.mocks.createSandbox).toHaveBeenCalledTimes(1);
  });

  it("shares a pending default Sandbox creation across concurrent calls", async () => {
    const sandbox = createSandboxHandle("sbx_default");
    const pending = createDeferred<SandboxHandle>();
    const client = createClient([pending.promise]);
    const session = new McpSession({ apiKey: "cn_test", client });

    const first = session.resolveSandbox();
    const second = session.resolveSandbox();
    pending.resolve(sandbox);

    await expect(first).resolves.toBe(sandbox);
    await expect(second).resolves.toBe(sandbox);
    expect(client.mocks.createSandbox).toHaveBeenCalledTimes(1);
  });

  it("clears failed pending default creation so a later call can retry", async () => {
    const sandbox = createSandboxHandle("sbx_default");
    const client = createClient([Promise.reject(new Error("boom")), sandbox]);
    const session = new McpSession({ apiKey: "cn_test", client });

    await expect(session.resolveSandbox()).rejects.toThrow("boom");
    await expect(session.resolveSandbox()).resolves.toBe(sandbox);

    expect(client.mocks.createSandbox).toHaveBeenCalledTimes(2);
  });

  it("creates a fresh default when the cached default has expired", async () => {
    const expired = createSandboxHandle("sbx_expired", {
      expiresAt: "1970-01-01T00:00:00.000Z",
    });
    const fresh = createSandboxHandle("sbx_fresh");
    const client = createClient([expired, fresh]);
    const session = new McpSession({ apiKey: "cn_test", client });

    await expect(session.resolveSandbox()).resolves.toBe(expired);
    await expect(session.resolveSandbox()).resolves.toBe(fresh);

    expect(client.mocks.createSandbox).toHaveBeenCalledTimes(2);
  });

  it("creates a fresh default when the cached default is not live", async () => {
    const destroyed = createSandboxHandle("sbx_destroyed", { status: "destroyed" });
    const fresh = createSandboxHandle("sbx_fresh");
    const client = createClient([destroyed, fresh]);
    const session = new McpSession({ apiKey: "cn_test", client });

    await expect(session.resolveSandbox()).resolves.toBe(destroyed);
    await expect(session.resolveSandbox()).resolves.toBe(fresh);

    expect(client.mocks.createSandbox).toHaveBeenCalledTimes(2);
  });

  it("clears the default Sandbox after killing it", async () => {
    const first = createSandboxHandle("sbx_first");
    const second = createSandboxHandle("sbx_second");
    const client = createClient([first, second]);
    const session = new McpSession({ apiKey: "cn_test", client });

    await expect(session.resolveSandbox()).resolves.toBe(first);
    await session.killSandbox("sbx_first");
    await expect(session.resolveSandbox()).resolves.toBe(second);

    expect(first.mocks.kill).toHaveBeenCalledTimes(1);
    expect(client.mocks.createSandbox).toHaveBeenCalledTimes(2);
  });
});

describe("McpSession explicit Sandboxes", () => {
  it("tracks explicitly-created Sandboxes by id", async () => {
    const sandbox = createSandboxHandle("sbx_created");
    const client = createClient([sandbox]);
    const session = new McpSession({ apiKey: "cn_test", client });

    await session.createSandbox({ ttlMs: 60_000 });

    await expect(session.resolveSandbox("sbx_created")).resolves.toBe(sandbox);
    expect(client.mocks.createSandbox).toHaveBeenCalledWith({ ttlMs: 60_000 });
  });

  it("does not make an explicitly-created Sandbox the default Sandbox", async () => {
    const explicit = createSandboxHandle("sbx_explicit");
    const defaultSandbox = createSandboxHandle("sbx_default");
    const client = createClient([explicit, defaultSandbox]);
    const session = new McpSession({ apiKey: "cn_test", client });

    await expect(session.createSandbox()).resolves.toBe(explicit);
    await expect(session.resolveSandbox()).resolves.toBe(defaultSandbox);

    expect(client.mocks.createSandbox).toHaveBeenCalledTimes(2);
  });

  it("best-effort kills all tracked Sandboxes during cleanup", async () => {
    const first = createSandboxHandle("sbx_first");
    const second = createSandboxHandle("sbx_second");
    second.mocks.kill.mockRejectedValueOnce(new Error("already gone"));
    const client = createClient([first, second]);
    const session = new McpSession({ apiKey: "cn_test", client });

    await session.createSandbox();
    await session.createSandbox();
    await expect(session.cleanup()).resolves.toBeUndefined();

    expect(first.mocks.kill).toHaveBeenCalledTimes(1);
    expect(second.mocks.kill).toHaveBeenCalledTimes(1);
  });
});

function createClient(
  sandboxes: readonly (Promise<SandboxHandle> | SandboxHandle)[],
): TestClient {
  const create = vi.fn();
  for (const sandbox of sandboxes) {
    create.mockResolvedValueOnce(sandbox);
  }

  return {
    sandboxes: {
      create,
    },
    mocks: {
      createSandbox: create,
    },
  } as unknown as TestClient;
}

function createSandboxHandle(
  id: `sbx_${string}`,
  input: {
    readonly expiresAt?: string;
    readonly status?: SandboxHandle["status"];
  } = {},
): TestSandbox {
  const kill = vi.fn().mockResolvedValue(undefined);

  return {
    expiresAt: input.expiresAt ?? "2999-01-01T00:00:00.000Z",
    id,
    kill,
    mocks: {
      kill,
    },
    status: input.status ?? "ready",
  } as unknown as TestSandbox;
}

function createDeferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
} {
  let resolve: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });

  if (resolve === undefined) {
    throw new Error("Deferred promise resolver was not initialized.");
  }

  return { promise, resolve };
}
