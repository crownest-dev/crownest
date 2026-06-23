import { describe, expect, it, vi } from "vitest";

import { createCrowNestClient } from "../index";

describe("SDK regression coverage", () => {
  registerSandboxByteRegressionTests();
  registerCommandLogRegressionTests();
  registerWorkspaceRunRegressionTests();
});

function registerSandboxByteRegressionTests() {
  it("keeps sandbox handle byte helpers usable when extracted", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ sandbox: sandboxBody() }))
      .mockResolvedValueOnce(
        jsonResponse({
          file: { path: "/workspace/blob.bin", sizeBytes: 3, type: "file" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse({ content: "AP8Q", encoding: "base64" }));
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });
    const sandbox = await client.sandboxes.get("sbx_123");
    const readBytes = sandbox.files.readBytes.bind(undefined);
    const writeBytes = sandbox.files.writeBytes.bind(undefined);

    await expect(
      writeBytes("/workspace/blob.bin", new Uint8Array([0, 255, 16])),
    ).resolves.toMatchObject({ path: "/workspace/blob.bin" });
    await expect(readBytes("/workspace/blob.bin")).resolves.toEqual(
      new Uint8Array([0, 255, 16]),
    );
    expect(JSON.parse(fetchMock.mock.calls[1]?.[1]?.body as string)).toEqual({
      content: "AP8Q",
      encoding: "base64",
      path: "/workspace/blob.bin",
    });
    expect(fetchMock.mock.calls[2]?.[0]).toBe(
      "https://api.test/v1/sandboxes/sbx_123/files/read?path=%2Fworkspace%2Fblob.bin&encoding=base64",
    );
  });
}

function registerCommandLogRegressionTests() {
  it("reconnects command log streams after clean EOF before terminal", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const path = requestUrl(input);
      if (path.endsWith("/v1/commands/cmd_123/stream")) {
        return Promise.resolve(cleanlyClosedCommandStreamResponse());
      }
      if (path.endsWith("/v1/commands/cmd_123/stream?afterSeq=1")) {
        return Promise.resolve(reconnectedCommandStreamResponse());
      }
      return Promise.reject(new Error(`unexpected URL ${path}`));
    });
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });
    const events = [];

    for await (const event of client.commands.streamLogs("cmd_123")) {
      events.push(event);
    }

    expect(
      events.map((event) => (event.type === "log" ? event.seq : event.type)),
    ).toEqual([1, 2, "terminal"]);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://api.test/v1/commands/cmd_123/stream",
      "https://api.test/v1/commands/cmd_123/stream?afterSeq=1",
    ]);
  });
}

function registerWorkspaceRunRegressionTests() {
  it("reconnects workspace run event streams from the last seen sequence", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockImplementation((input) => {
      const path = requestUrl(input);
      if (path.endsWith("/v1/workspace-runs/wsr_123/events?stream=true")) {
        return Promise.resolve(erroringWorkspaceRunStreamResponse());
      }
      if (path.endsWith("/v1/workspace-runs/wsr_123/events?afterSeq=1&stream=true")) {
        return Promise.resolve(reconnectedWorkspaceRunStreamResponse());
      }
      return Promise.reject(new Error(`unexpected URL ${path}`));
    });
    const client = createCrowNestClient({
      apiKey: "cn_live_test",
      baseUrl: "https://api.test",
      fetch: fetchMock,
    });
    const events = [];

    for await (const event of client.workspaceRuns.streamEvents("wsr_123")) {
      events.push(event);
    }

    expect(
      events.map((event) => (event.type === "terminal" ? event.type : event.seq)),
    ).toEqual([1, 2, "terminal"]);
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      "https://api.test/v1/workspace-runs/wsr_123/events?stream=true",
      "https://api.test/v1/workspace-runs/wsr_123/events?afterSeq=1&stream=true",
    ]);
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") {
    return input;
  }
  return input instanceof URL ? input.href : input.url;
}

function sandboxBody() {
  return {
    expiresAt: "2026-06-09T15:30:00.000Z",
    id: "sbx_123",
    metadata: {},
    orgId: "org_123",
    projectId: "prj_123",
    status: "ready",
    templateId: "tpl_python_node",
    templateSlug: "python-node",
    templateVersion: "2026-06-01",
    templateVersionId: "tplv_123",
    ttlMs: 3_600_000,
  };
}

function cleanlyClosedCommandStreamResponse(): Response {
  return new Response(
    [
      'data: {"type":"log","seq":1,"stream":"stdout","data":"ready\\n","createdAt":"now"}',
      "",
      "",
    ].join("\n"),
    { headers: { "content-type": "text/event-stream" } },
  );
}

function reconnectedCommandStreamResponse(): Response {
  return new Response(
    [
      'data: {"type":"log","seq":2,"stream":"stdout","data":"again\\n","createdAt":"now"}',
      "",
      `data: ${JSON.stringify({ command: terminalCommand(), createdAt: "now", type: "terminal" })}`,
      "",
      "",
    ].join("\n"),
    { headers: { "content-type": "text/event-stream" } },
  );
}

function erroringWorkspaceRunStreamResponse(): Response {
  let sent = false;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent) {
          throw new Error("network reset");
        }
        sent = true;
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"type":"status","seq":1,"status":"running","createdAt":"now"}\n\n',
          ),
        );
      },
    }),
    { headers: { "content-type": "text/event-stream" } },
  );
}

function reconnectedWorkspaceRunStreamResponse(): Response {
  return new Response(
    [
      'data: {"type":"stdout","seq":2,"data":"again\\n","createdAt":"now"}',
      "",
      `data: ${JSON.stringify({
        createdAt: "now",
        seq: 3,
        type: "terminal",
        workspaceRun: workspaceRunBody(),
      })}`,
      "",
      "",
    ].join("\n"),
    { headers: { "content-type": "text/event-stream" } },
  );
}

function workspaceRunBody() {
  return {
    command: "pnpm test",
    createdAt: "now",
    id: "wsr_123",
    metadata: {},
    orchestrationSucceeded: true,
    projectId: "prj_123",
    status: "succeeded",
    template: "python-node",
  };
}

function terminalCommand() {
  return {
    command: "npm test",
    cwd: "/workspace",
    env: {},
    exitCode: 0,
    id: "cmd_123",
    sandboxId: "sbx_123",
    status: "exited",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}
