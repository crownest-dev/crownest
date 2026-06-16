/* eslint-disable max-lines, max-lines-per-function -- SDK surface tests intentionally keep public client fixtures together. */
import { describe, expect, it, vi } from "vitest";

import { createCrowNestClient } from "../index";

describe("SDK surface", () => {
  registerFactoryTests();
  registerSandboxCodeHandleTests();
  registerSandboxCommandHandleTests();
  registerSandboxFileArtifactHandleTests();
  registerDirectFileArtifactClientTests();
  registerCommandCollectTests();
  registerCommandClientTests();
});

function registerFactoryTests() {
  it("exposes the canonical CrowNest client factory", () => {
    const client = createCrowNestClient({ apiKey: "cnk_test_key" });

    expect(typeof client.apiKeys.list).toBe("function");
    expect(typeof client.apiKeys.get).toBe("function");
    expect(typeof client.apiKeys.revoke).toBe("function");
    expect(typeof client.code.runStream).toBe("function");
    expect(typeof client.code.listContexts).toBe("function");
    expect(typeof client.projects.create).toBe("function");
    expect(typeof client.sandboxes.create).toBe("function");
    expect(typeof client.sandboxes.extend).toBe("function");
    expect(typeof client.sandboxes.get).toBe("function");
    expect(typeof client.usage).toBe("function");
  });

  it("exposes CRUD completion helpers on root clients and sandbox handles", async () => {
    const context = {
      createdAt: "2026-06-09T15:30:00.000Z",
      cwd: "/workspace",
      id: "cctx_123",
      language: "python",
      sandboxId: "sbx_123",
    };
    const apiKey = {
      createdAt: "2026-06-09T15:30:00.000Z",
      createdByUserId: "usr_123",
      id: "key_123",
      last4: "test",
      name: "Manager",
      orgId: "org_123",
      prefix: "cn_live_test",
      scopes: ["api_key:read", "api_key:revoke"],
    };
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ data: [apiKey], hasMore: false }))
      .mockResolvedValueOnce(jsonResponse({ apiKey }))
      .mockResolvedValueOnce(
        jsonResponse({
          apiKey: { ...apiKey, revokedAt: "2026-06-09T16:00:00.000Z" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          project: {
            createdAt: "2026-06-09T15:30:00.000Z",
            id: "prj_created",
            name: "Agent Workspace",
            orgId: "org_123",
          },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ data: [context], hasMore: false }))
      .mockResolvedValueOnce(jsonResponse({ context }))
      .mockResolvedValueOnce(sandboxResponse())
      .mockResolvedValueOnce(jsonResponse({ data: [context], hasMore: false }))
      .mockResolvedValueOnce(jsonResponse({ context }));
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });

    await expect(client.apiKeys.list()).resolves.toEqual([apiKey]);
    await expect(client.apiKeys.get("key_123")).resolves.toEqual(apiKey);
    await expect(client.apiKeys.revoke("key_123")).resolves.toMatchObject({
      revokedAt: "2026-06-09T16:00:00.000Z",
    });
    await expect(
      client.projects.create({ name: "Agent Workspace" }),
    ).resolves.toMatchObject({ id: "prj_created" });
    await expect(client.code.listContexts("sbx_123")).resolves.toEqual([context]);
    await expect(client.code.getContext("sbx_123", "cctx_123")).resolves.toEqual(
      context,
    );

    const sandbox = await client.sandboxes.get("sbx_123");
    await expect(sandbox.code.listContexts()).resolves.toEqual([context]);
    await expect(sandbox.code.getContext("cctx_123")).resolves.toEqual(context);

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://api.test/v1/api-keys",
      "https://api.test/v1/api-keys/key_123",
      "https://api.test/v1/api-keys/key_123",
      "https://api.test/v1/projects",
      "https://api.test/v1/sandboxes/sbx_123/code/contexts",
      "https://api.test/v1/sandboxes/sbx_123/code/contexts/cctx_123",
      "https://api.test/v1/sandboxes/sbx_123",
      "https://api.test/v1/sandboxes/sbx_123/code/contexts",
      "https://api.test/v1/sandboxes/sbx_123/code/contexts/cctx_123",
    ]);
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: "DELETE" });
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      body: JSON.stringify({ name: "Agent Workspace" }),
      method: "POST",
    });
  });
}

function registerSandboxCodeHandleTests() {
  it("exposes sandbox code helpers with language options and streaming", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(sandboxResponse())
      .mockResolvedValueOnce(
        jsonResponse({
          context: {
            createdAt: "2026-06-09T15:30:00.000Z",
            cwd: "/workspace",
            id: "cctx_123",
            language: "typescript",
            sandboxId: "sbx_123",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          run: {
            contextId: "cctx_123",
            executionCount: 1,
            language: "javascript",
            outputs: [],
            sandboxId: "sbx_123",
            stderr: [],
            stdout: ["1\n"],
          },
        }),
      )
      .mockResolvedValueOnce(
        new Response('event: stdout\ndata: {"type":"stdout","data":"ready\\n"}\n\n', {
          headers: { "content-type": "text/event-stream" },
        }),
      );
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });

    const sandbox = await client.sandboxes.get("sbx_123");
    await expect(
      sandbox.code.createContext({ language: "typescript" }),
    ).resolves.toMatchObject({ language: "typescript" });
    await expect(
      sandbox.code.run({ code: "1", language: "javascript" }),
    ).resolves.toMatchObject({ language: "javascript" });

    const events = [];
    for await (const event of sandbox.code.runStream({
      code: "print('ready')",
      idempotencyKey: "code-stream-key",
      language: "python",
    })) {
      events.push(event);
    }

    expect(events).toEqual([{ data: "ready\n", type: "stdout" }]);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.test/v1/sandboxes/sbx_123/code/contexts",
      expect.objectContaining({
        body: JSON.stringify({ language: "typescript" }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "https://api.test/v1/sandboxes/sbx_123/code/runs",
      expect.objectContaining({
        body: JSON.stringify({ language: "javascript", code: "1" }),
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "https://api.test/v1/sandboxes/sbx_123/code/runs/stream",
      expect.objectContaining({
        body: JSON.stringify({ language: "python", code: "print('ready')" }),
        method: "POST",
      }),
    );
    const streamHeaders = fetchMock.mock.calls[3]?.[1]?.headers;
    expect(streamHeaders).toBeInstanceOf(Headers);
    expect((streamHeaders as Headers).get("idempotency-key")).toBe("code-stream-key");
  });

  it("streams code through the direct client without reading the sandbox first", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('event: stdout\ndata: {"type":"stdout","data":"ready\\n"}\n\n', {
        headers: { "content-type": "text/event-stream" },
      }),
    );
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });

    const events = [];
    for await (const event of client.code.runStream("sbx_123", {
      code: "print('ready')",
      idempotencyKey: "direct-code-stream-key",
      language: "python",
    })) {
      events.push(event);
    }

    expect(events).toEqual([{ data: "ready\n", type: "stdout" }]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/v1/sandboxes/sbx_123/code/runs/stream",
      expect.objectContaining({
        body: JSON.stringify({ language: "python", code: "print('ready')" }),
        method: "POST",
      }),
    );
    const streamHeaders = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(streamHeaders).toBeInstanceOf(Headers);
    expect((streamHeaders as Headers).get("idempotency-key")).toBe(
      "direct-code-stream-key",
    );
  });
}

function registerSandboxCommandHandleTests() {
  it("creates sandbox handles that can run commands", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(sandboxResponse())
      .mockResolvedValueOnce(
        sandboxResponse({
          expiresAt: "2026-06-09T16:00:00.000Z",
          ttlMs: 5_400_000,
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          command: {
            command: "python main.py",
            cwd: "/workspace",
            env: {},
            exitCode: 0,
            id: "cmd_123",
            sandboxId: "sbx_123",
            status: "exited",
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          command: {
            cancelMode: "force",
            command: "python main.py",
            cwd: "/workspace",
            env: {},
            id: "cmd_123",
            sandboxId: "sbx_123",
            status: "canceled",
          },
        }),
      );
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });

    const sandbox = await client.sandboxes.create({ projectId: "prj_123" });
    const extended = await sandbox.extend({
      idempotencyKey: "extend-key",
      ttlMs: 5_400_000,
    });
    const command = await extended.commands.run("python main.py");
    const canceled = await extended.commands.cancel("cmd_123", { mode: "force" });

    expect(sandbox.id).toBe("sbx_123");
    expect(extended.ttlMs).toBe(5_400_000);
    expect(command.id).toBe("cmd_123");
    expect(canceled.status).toBe("canceled");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/v1/sandboxes",
      expect.objectContaining({
        body: JSON.stringify({ projectId: "prj_123" }),
        method: "POST",
      }),
    );
    const createHeaders = fetchMock.mock.calls[0]?.[1]?.headers;
    expect(createHeaders).toBeInstanceOf(Headers);
    expect((createHeaders as Headers).get("authorization")).toBe("Bearer cn_live_test");
    expect((createHeaders as Headers).get("idempotency-key")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/v1/sandboxes/sbx_123/extend",
      expect.objectContaining({
        body: JSON.stringify({ ttlMs: 5_400_000 }),
        method: "POST",
      }),
    );
    const extendHeaders = fetchMock.mock.calls[1]?.[1]?.headers;
    expect(extendHeaders).toBeInstanceOf(Headers);
    expect((extendHeaders as Headers).get("idempotency-key")).toBe("extend-key");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/v1/commands/cmd_123/cancel",
      expect.objectContaining({
        body: JSON.stringify({ mode: "force" }),
        method: "POST",
      }),
    );
  });
}

function registerSandboxFileArtifactHandleTests() {
  it("exposes file and artifact helpers on sandbox handles", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(sandboxResponse())
      .mockResolvedValueOnce(
        jsonResponse({
          file: { path: "/workspace/input.txt", sizeBytes: 5, type: "file" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ content: "hello", encoding: "utf8" }))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              name: "input.txt",
              path: "/workspace/input.txt",
              sizeBytes: 5,
              type: "file",
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ artifact: artifactResponseBody() }))
      .mockResolvedValueOnce(
        jsonResponse({ data: [artifactResponseBody()], hasMore: false }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          authMode: "api_key",
          headers: { "x-content-type-options": "nosniff" },
          method: "GET",
          url: "https://api.test/v1/artifacts/art_123/download",
        }),
      );
    fetchMock.mockResolvedValueOnce(new Response("hello"));
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });

    const sandbox = await client.sandboxes.get("sbx_123");
    await expect(
      sandbox.files.write("/workspace/input.txt", "hello"),
    ).resolves.toMatchObject({ path: "/workspace/input.txt" });
    await expect(sandbox.files.read("/workspace/input.txt")).resolves.toBe("hello");
    await expect(sandbox.files.list()).resolves.toHaveLength(1);
    await expect(
      sandbox.artifacts.create({ path: "/workspace/input.txt" }),
    ).resolves.toMatchObject({ id: "art_123" });
    await expect(sandbox.artifacts.list()).resolves.toHaveLength(1);
    await expect(client.artifacts.downloadUrl("art_123")).resolves.toMatchObject({
      method: "GET",
    });
    await expect(client.artifacts.download("art_123")).resolves.toEqual(
      new TextEncoder().encode("hello"),
    );
  });
}

function registerDirectFileArtifactClientTests() {
  it("exposes direct file and artifact helpers without fetching sandboxes", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          file: { path: "/workspace/input.txt", sizeBytes: 5, type: "file" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ artifact: artifactResponseBody() }));
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });

    await expect(
      client.files.write("sbx_123", "/workspace/input.txt", "hello"),
    ).resolves.toMatchObject({ path: "/workspace/input.txt" });
    await expect(
      client.artifacts.create("sbx_123", { path: "/workspace/input.txt" }),
    ).resolves.toMatchObject({ id: "art_123" });

    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://api.test/v1/sandboxes/sbx_123/files",
      "https://api.test/v1/sandboxes/sbx_123/artifacts",
    ]);
  });

  it("preserves mounted base URL paths for direct downloads", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("hello"));
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test/crownest",
      fetch: fetchMock,
    });

    await expect(client.artifacts.download("art_123")).resolves.toEqual(
      new TextEncoder().encode("hello"),
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/crownest/v1/artifacts/art_123/download",
      expect.objectContaining({ method: "GET" }),
    );
  });
}

function registerCommandCollectTests() {
  it("passes command collection options through top-level run helpers", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        command: {
          collectStatus: "pending",
          command: "python script.py",
          cwd: "/workspace",
          env: {},
          id: "cmd_123",
          sandboxId: "sbx_123",
          status: "running",
        },
      }),
    );
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });

    await client.commands.run("sbx_123", "python script.py", {
      collect: [{ name: "output.csv", path: "/workspace/output.csv" }],
      collectOn: "always",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/v1/sandboxes/sbx_123/commands/run",
      expect.objectContaining({
        body: JSON.stringify({
          command: "python script.py",
          collect: [{ name: "output.csv", path: "/workspace/output.csv" }],
          collectOn: "always",
        }),
        method: "POST",
      }),
    );
  });
}

function registerCommandClientTests() {
  it("exposes top-level command polling, cancel, logs, and stream helpers", async () => {
    const fetchMock = commandFetchMock();
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });

    await expect(client.commands.get("cmd_123")).resolves.toMatchObject({
      id: "cmd_123",
      status: "running",
    });
    await expect(
      client.commands.cancel("cmd_123", { mode: "force" }),
    ).resolves.toMatchObject({ cancelMode: "force", status: "canceled" });
    await expect(client.commands.logs("cmd_123")).resolves.toEqual([
      {
        commandId: "cmd_123",
        createdAt: "2026-06-09T15:30:00.000Z",
        data: "ready\n",
        seq: 1,
        stream: "stdout",
      },
    ]);

    const events = [];
    for await (const event of client.commands.streamLogs("cmd_123", {
      reconnect: false,
    })) {
      events.push(event);
    }

    expect(events).toEqual([
      {
        createdAt: "2026-06-09T15:30:00.000Z",
        data: "ready\n",
        seq: 1,
        stream: "stdout",
        type: "log",
      },
    ]);
  });

  it("aborts command log streams when consumers stop iterating early", async () => {
    const streamCancel = vi.fn();
    let signal: AbortSignal | undefined;
    const body = new ReadableStream<Uint8Array>({
      cancel: streamCancel,
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'id: 1\nevent: log\ndata: {"type":"log","seq":1,"stream":"stdout","data":"ready\\n","createdAt":"2026-06-09T15:30:00.000Z"}\n\n',
          ),
        );
      },
    });
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((_url, init) => {
      signal = init?.signal as AbortSignal | undefined;
      return Promise.resolve(
        new Response(body, { headers: { "content-type": "text/event-stream" } }),
      );
    });
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });
    const iterator = client.commands.streamLogs("cmd_123")[Symbol.asyncIterator]();

    await expect(iterator.next()).resolves.toMatchObject({
      done: false,
      value: {
        data: "ready\n",
        seq: 1,
        type: "log",
      },
    });
    await iterator.return?.();

    expect(streamCancel).toHaveBeenCalledTimes(1);
    expect(signal?.aborted).toBe(true);
  });
}

function commandFetchMock() {
  return vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(commandResponse("running"))
    .mockResolvedValueOnce(commandResponse("canceled", { cancelMode: "force" }))
    .mockResolvedValueOnce(commandLogsResponse())
    .mockResolvedValueOnce(commandStreamResponse());
}

function sandboxResponse(overrides: Record<string, unknown> = {}): Response {
  return jsonResponse({
    sandbox: sandboxBody(overrides),
  });
}

function sandboxBody(overrides: Record<string, unknown> = {}) {
  return {
    expiresAt: "2026-06-09T15:30:00.000Z",
    id: "sbx_123",
    metadata: {},
    orgId: "org_123",
    projectId: "prj_123",
    status: "ready",
    templateId: "tpl_python",
    templateSlug: "python",
    templateVersion: "2026-06-01",
    templateVersionId: "tplv_123",
    ttlMs: 3_600_000,
    ...overrides,
  };
}

function artifactResponseBody() {
  return {
    createdAt: "2026-06-09T15:30:00.000Z",
    id: "art_123",
    name: "input.txt",
    objectKey: "orgs/org_123/projects/prj_123/objects/obj_123",
    orgId: "org_123",
    projectId: "prj_123",
    sandboxId: "sbx_123",
    sizeBytes: 5,
  };
}

function commandResponse(
  status: "canceled" | "running",
  extras: Record<string, unknown> = {},
): Response {
  return jsonResponse({
    command: {
      command: "npm run dev",
      cwd: "/workspace",
      env: {},
      id: "cmd_123",
      sandboxId: "sbx_123",
      status,
      ...extras,
    },
  });
}

function commandLogsResponse(): Response {
  return jsonResponse({
    data: [
      {
        commandId: "cmd_123",
        createdAt: "2026-06-09T15:30:00.000Z",
        data: "ready\n",
        seq: 1,
        stream: "stdout",
      },
    ],
    hasMore: false,
  });
}

function commandStreamResponse(): Response {
  return new Response(
    'id: 1\nevent: log\ndata: {"type":"log","seq":1,"stream":"stdout","data":"ready\\n","createdAt":"2026-06-09T15:30:00.000Z"}\n\n',
    { headers: { "content-type": "text/event-stream" } },
  );
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

/* eslint-enable max-lines, max-lines-per-function -- End SDK surface fixture exception. */
