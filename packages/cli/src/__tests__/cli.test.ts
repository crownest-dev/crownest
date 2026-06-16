/* eslint-disable max-lines, max-lines-per-function -- CLI surface tests intentionally keep command fixtures in one file. */
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runCli } from "../index";

describe("runCli", () => {
  registerSandboxCliTests();
  registerSandboxExtendCliTests();
  registerCommandCliTests();
  registerCommandCollectCliTests();
  registerCodeCliTests();
  registerFileArtifactCliTests();
  registerLogCliTests();
  registerBinTests();
  registerUsageAndOutputTests();
});

function registerSandboxCliTests() {
  it("creates a sandbox through the SDK transport", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sandbox: {
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
        },
      }),
    );
    const result = await runCli(
      ["sandboxes", "create", "--project", "prj_123"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("id: sbx_123");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/v1/sandboxes",
      expect.objectContaining({ method: "POST" }),
    );
  });
}

function registerSandboxExtendCliTests() {
  it("extends a sandbox through the SDK transport", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        sandbox: {
          expiresAt: "2026-06-09T16:00:00.000Z",
          id: "sbx_123",
          metadata: {},
          orgId: "org_123",
          projectId: "prj_123",
          status: "ready",
          templateId: "tpl_python",
          templateSlug: "python",
          templateVersion: "2026-06-01",
          templateVersionId: "tplv_123",
          ttlMs: 5_400_000,
        },
      }),
    );
    const result = await runCli(
      ["sandboxes", "extend", "sbx_123", "--ttl-ms", "5400000"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toBe("");
    expect(result.stdout).toContain("expiresAt: 2026-06-09T16:00:00.000Z");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.test/v1/sandboxes/sbx_123/extend",
      expect.objectContaining({
        body: JSON.stringify({ ttlMs: 5_400_000 }),
        method: "POST",
      }),
    );
  });

  it("rejects invalid sandbox extension TTL before making a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await runCli(
      ["sandboxes", "extend", "sbx_123", "--ttl-ms", "0"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--ttl-ms must be a positive integer");
    expect(fetchMock).not.toHaveBeenCalled();
  });
}

function registerFileArtifactCliTests() {
  it("writes files and creates downloadable artifacts", async () => {
    const outputPath = resolve(
      mkdtempSync(resolve(tmpdir(), "crownest-cli-")),
      "artifact.bin",
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          file: { path: "/workspace/input.txt", sizeBytes: 5, type: "file" },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          artifact: {
            createdAt: "2026-06-09T15:30:00.000Z",
            id: "art_123",
            name: "input.txt",
            objectKey: "orgs/org_123/projects/prj_123/objects/obj_123",
            orgId: "org_123",
            projectId: "prj_123",
            sandboxId: "sbx_123",
            sizeBytes: 5,
          },
        }),
      )
      .mockResolvedValueOnce(new Response("hello"));

    const writeResult = await runCli(
      ["files", "write", "sbx_123", "/workspace/input.txt", "hello"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );
    expect(writeResult.stdout).toContain("path: /workspace/input.txt");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/v1/sandboxes/sbx_123/files",
    );
    const createResult = await runCli(
      ["artifacts", "create", "sbx_123", "/workspace/input.txt"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );
    expect(createResult.stdout).toContain("id: art_123");
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://api.test/v1/sandboxes/sbx_123/artifacts",
    );
    const downloadResult = await runCli(
      ["artifacts", "download", "art_123", "--output", outputPath],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );
    expect(downloadResult.stdout).toContain(`path: ${outputPath}`);
    expect(readFileSync(outputPath, "utf8")).toBe("hello");
    const downloadCall = fetchMock.mock.calls.at(-1);
    expect(downloadCall?.[0]).toBe("https://api.test/v1/artifacts/art_123/download");
    expect(downloadCall?.[1]?.method).toBe("GET");
    expect(downloadCall?.[1]?.headers).toBeInstanceOf(Headers);
    expect((downloadCall?.[1]?.headers as Headers).get("authorization")).toBe(
      "Bearer cn_live_test",
    );
  });

  it("treats dash-prefixed file content as literal content", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        file: { path: "/workspace/list.md", sizeBytes: 6, type: "file" },
      }),
    );

    const writeResult = await runCli(
      ["files", "write", "sbx_123", "/workspace/list.md", "- item", "--json"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(writeResult.exitCode).toBe(0);
    expect(writeResult.stderr).toBe("");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/v1/sandboxes/sbx_123/files",
    );
    const writeRequestBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(typeof writeRequestBody).toBe("string");
    expect(JSON.parse(writeRequestBody as string)).toMatchObject({
      content: "- item",
      createParents: false,
      path: "/workspace/list.md",
    });
  });
}

function registerBinTests() {
  it("advertises the built crownest binary for published installs", () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(import.meta.dirname, "../../package.json"), "utf8"),
    ) as {
      readonly bin: { readonly crownest: string };
      readonly exports?: unknown;
      readonly files: readonly string[];
      readonly publishConfig: Record<string, unknown>;
    };
    const sourceEntry = readFileSync(
      resolve(import.meta.dirname, "../../src/index.ts"),
      "utf8",
    );

    expect(packageJson.bin.crownest).toBe("./dist/index.js");
    expect(packageJson.files).toContain("dist");
    expect(sourceEntry).toContain("runCli");
    expect(packageJson.exports).toBeUndefined();
    expect("bin" in packageJson.publishConfig).toBe(false);
  });
}

function registerCommandCliTests() {
  it("preserves command argv boundaries with shell escaping", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        command: {
          command: "python -c 'print('\"'\"'hello world'\"'\"')'",
          cwd: "/workspace",
          env: {},
          id: "cmd_123",
          sandboxId: "sbx_123",
          status: "exited",
        },
      }),
    );

    await runCli(
      ["commands", "run", "sbx_123", "--", "python", "-c", "print('hello world')"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/v1/sandboxes/sbx_123/commands/run",
    );
    const commandRequest = fetchMock.mock.calls[0]?.[1];
    expect(commandRequest?.body).toBe(
      JSON.stringify({
        command: "python -c 'print('\"'\"'hello world'\"'\"')'",
      }),
    );
  });

  it("keeps --json after the separator inside the executed command", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        command: {
          command: "echo --json",
          cwd: "/workspace",
          env: {},
          id: "cmd_123",
          sandboxId: "sbx_123",
          status: "exited",
        },
      }),
    );

    await runCli(
      ["commands", "run", "sbx_123", "--", "echo", "--json"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      command: "echo --json",
    });
  });

  it("cancels commands with force mode", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        command: {
          cancelMode: "force",
          command: "npm run dev",
          cwd: "/workspace",
          env: {},
          id: "cmd_123",
          sandboxId: "sbx_123",
          status: "canceled",
        },
      }),
    );
    const result = await runCli(
      ["commands", "cancel", "cmd_123", "--force"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.stdout).toContain("id: cmd_123");
    expect(result.stdout).toContain("status: canceled");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/v1/commands/cmd_123/cancel",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(JSON.stringify({ mode: "force" }));
  });
}

function registerCodeCliTests() {
  it("streams code run output from inline source", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          [
            'event: stdout\ndata: {"type":"stdout","data":"ready\\n"}\n\n',
            'event: output\ndata: {"type":"output","data":{"kind":"artifact","format":"png","artifactId":"art_123","contentType":"image/png","sizeBytes":10}}\n\n',
            'event: complete\ndata: {"type":"complete","data":{"sandboxId":"sbx_123","contextId":"cctx_123","language":"python","executionCount":1,"stdout":["ready\\n"],"stderr":[],"outputs":[]}}\n\n',
          ].join(""),
          { headers: { "content-type": "text/event-stream" } },
        ),
      );

    const result = await runCli(
      [
        "code",
        "run",
        "sbx_123",
        "--code",
        "print('ready')",
        "--artifact-policy",
        "promote",
      ],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "ready\n[artifact art_123 image/png 10B]\n",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/v1/sandboxes/sbx_123/code/runs/stream",
    );
    const request = fetchMock.mock.calls[0]?.[1];
    expect(request?.method).toBe("POST");
    expect(JSON.parse(request?.body as string)).toEqual({
      artifactPolicy: "promote",
      code: "print('ready')",
      language: "python",
    });
  });

  it("reads code run source from a local file", async () => {
    const sourcePath = resolve(
      mkdtempSync(resolve(tmpdir(), "crownest-cli-code-")),
      "script.ts",
    );
    writeFileSync(sourcePath, "console.log(1)");
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          'event: complete\ndata: {"type":"complete","data":{"sandboxId":"sbx_123","contextId":"cctx_123","language":"typescript","executionCount":1,"stdout":[],"stderr":[],"outputs":[]}}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
      );

    const result = await runCli(
      ["code", "run", "sbx_123", "--file", sourcePath, "--language", "typescript"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      code: "console.log(1)",
      language: "typescript",
    });
  });

  it("prints execution errors carried by complete events", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          'event: complete\ndata: {"type":"complete","data":{"sandboxId":"sbx_123","contextId":"cctx_123","language":"python","executionCount":1,"stdout":[],"stderr":[],"outputs":[],"error":{"name":"TimeoutError","message":"Code execution exceeded 100 ms."}}}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
      );

    const result = await runCli(
      ["code", "run", "sbx_123", "--code", "while True: pass"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result).toEqual({
      exitCode: 1,
      stderr: "TimeoutError: Code execution exceeded 100 ms.\n",
      stdout: "",
    });
  });

  it("does not duplicate execution errors sent before complete", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          [
            'event: error\ndata: {"type":"error","data":{"name":"RuntimeError","message":"boom"}}\n\n',
            'event: complete\ndata: {"type":"complete","data":{"sandboxId":"sbx_123","contextId":"cctx_123","language":"python","executionCount":1,"stdout":[],"stderr":[],"outputs":[],"error":{"name":"RuntimeError","message":"boom"}}}\n\n',
          ].join(""),
          { headers: { "content-type": "text/event-stream" } },
        ),
      );

    const result = await runCli(
      ["code", "run", "sbx_123", "--code", "raise RuntimeError('boom')"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result).toEqual({
      exitCode: 1,
      stderr: "RuntimeError: boom\n",
      stdout: "",
    });
  });

  it("prints complete-only code stream replays", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          'event: complete\ndata: {"type":"complete","data":{"sandboxId":"sbx_123","contextId":"cctx_123","language":"python","executionCount":1,"stdout":["ready\\n"],"stderr":["warn\\n"],"outputs":[{"kind":"inline","format":"text","value":"answer"}]}}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
      );

    const result = await runCli(
      [
        "code",
        "run",
        "sbx_123",
        "--code",
        "print('ready')",
        "--idempotency-key",
        "replay-key",
      ],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: "warn\n",
      stdout: "ready\nanswer\n",
    });
  });

  it("fails when the code run stream ends before completion", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response('event: stdout\ndata: {"type":"stdout","data":"partial\\n"}\n\n', {
        headers: { "content-type": "text/event-stream" },
      }),
    );

    const result = await runCli(
      ["code", "run", "sbx_123", "--code", "print('partial')"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result).toEqual({
      exitCode: 1,
      stderr: "Error: code run stream ended before a complete event.\n",
      stdout: "partial\n",
    });
  });

  it("rejects ambiguous code run source arguments before fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const result = await runCli(
      ["code", "run", "sbx_123", "--code", "1", "--file", "script.py"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("Use exactly one of --code");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid code run language before fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const result = await runCli(
      ["code", "run", "sbx_123", "--code", "1", "--language", "ruby"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain(
      "--language must be python, javascript, or typescript",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects invalid code run timeout before fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const result = await runCli(
      ["code", "run", "sbx_123", "--code", "1", "--timeout-ms", "0"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("--timeout-ms must be a positive integer");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing code run sandbox id before fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const result = await runCli(
      ["code", "run", "--code", "1"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("sandbox id is required");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects missing code run option values before fetching", async () => {
    const fetchMock = vi.fn<typeof fetch>();

    const missingFile = await runCli(
      ["code", "run", "sbx_123", "--file"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );
    const flagAsValue = await runCli(
      ["code", "run", "sbx_123", "--code", "--language", "javascript"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(missingFile.exitCode).toBe(2);
    expect(missingFile.stderr).toContain("--file requires a value");
    expect(flagAsValue.exitCode).toBe(2);
    expect(flagAsValue.stderr).toContain("--code requires a value");
    expect(fetchMock).not.toHaveBeenCalled();
  });
}

function registerCommandCollectCliTests() {
  it("passes command collection options through run requests", async () => {
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

    await runCli(
      [
        "commands",
        "run",
        "sbx_123",
        "--collect",
        "/workspace/output.csv",
        "--collect-on",
        "always",
        "--",
        "python",
        "script.py",
      ],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/v1/sandboxes/sbx_123/commands/run",
    );
    expect(fetchMock.mock.calls[0]?.[1]?.body).toBe(
      JSON.stringify({
        command: "python script.py",
        collect: [{ path: "/workspace/output.csv" }],
        collectOn: "always",
      }),
    );
  });
}

function registerLogCliTests() {
  it("prints command log stream data", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          'id: 1\nevent: log\ndata: {"type":"log","seq":1,"stream":"stdout","data":"ready\\n","createdAt":"2026-06-09T15:30:00.000Z"}\n\n' +
            'data: {"type":"terminal","createdAt":"2026-06-09T15:30:01.000Z","command":{"id":"cmd_123","status":"exited"}}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
      );
    const result = await runCli(
      ["logs", "cmd_123"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.stdout).toBe("ready\n");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/v1/commands/cmd_123/stream",
    );
  });

  it("streams command log data through the output sink", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          'id: 1\nevent: log\ndata: {"type":"log","seq":1,"stream":"stderr","data":"booting\\n","createdAt":"2026-06-09T15:30:00.000Z"}\n\n' +
            'data: {"type":"terminal","createdAt":"2026-06-09T15:30:01.000Z","command":{"id":"cmd_123","status":"exited"}}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
      );
    const stderrWrite = vi.fn();
    const stdoutWrite = vi.fn();
    const result = await runCli(
      ["logs", "cmd_123"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
      {
        stderr: { write: stderrWrite },
        stdout: { write: stdoutWrite },
      },
    );

    expect(result.stdout).toBe("");
    expect(stderrWrite).toHaveBeenCalledWith("booting\n");
    expect(stdoutWrite).not.toHaveBeenCalled();
  });

  it("fails when command log stream reports an error event", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          'event: error\ndata: {"type":"error","code":"stream_gap","message":"Requested command log position is no longer available.","createdAt":"2026-06-09T15:30:00.000Z"}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
      );
    const result = await runCli(
      ["logs", "cmd_123"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result).toMatchObject({
      exitCode: 1,
      stderr: "stream_gap: Requested command log position is no longer available.\n",
      stdout: "",
    });
  });
}

function registerUsageAndOutputTests() {
  it("rejects unknown commands with a help pointer", async () => {
    const result = await runCli(["bogus"]);

    expect(result).toEqual({
      exitCode: 2,
      stderr: "Unknown command: bogus. Run `crownest --help` for the command list.\n",
      stdout: "",
    });
  });

  it("rejects unknown flags before making a request", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await runCli(
      ["sandboxes", "create", "--templte", "python"],
      {},
      fetchMock,
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("unknown flag: --templte");
    expect(result.stderr).toContain("--project");
    expect(result.stderr).toContain("--template");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects unknown double-dash tokens used as string flag values", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await runCli(
      ["sandboxes", "create", "--template", "--templte"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain("unknown flag: --templte");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects extra positional arguments before mutating resources", async () => {
    const uploadPath = resolve(
      mkdtempSync(resolve(tmpdir(), "crownest-cli-upload-")),
      "upload.txt",
    );
    const downloadPath = resolve(
      mkdtempSync(resolve(tmpdir(), "crownest-cli-download-")),
      "artifact.bin",
    );
    writeFileSync(uploadPath, "hello");
    const environment = {
      CROWNEST_API_KEY: "cn_live_test",
      CROWNEST_API_URL: "https://api.test",
    };
    const mutationCases: readonly {
      readonly argv: readonly string[];
      readonly command: string;
    }[] = [
      {
        argv: ["sandboxes", "extend", "sbx_123", "--ttl-ms", "1000", "extra"],
        command: "sandboxes extend",
      },
      { argv: ["sandboxes", "kill", "sbx_123", "extra"], command: "sandboxes kill" },
      { argv: ["commands", "cancel", "cmd_123", "extra"], command: "commands cancel" },
      {
        argv: ["code", "run", "sbx_123", "extra", "--code", "print(1)"],
        command: "code run",
      },
      {
        argv: ["files", "delete", "sbx_123", "/workspace/a", "extra"],
        command: "files delete",
      },
      {
        argv: ["files", "mkdir", "sbx_123", "/workspace/a", "extra"],
        command: "files mkdir",
      },
      {
        argv: ["files", "move", "sbx_123", "/workspace/a", "/workspace/b", "extra"],
        command: "files move",
      },
      {
        argv: ["files", "upload", "sbx_123", uploadPath, "/workspace/a", "extra"],
        command: "files upload",
      },
      {
        argv: ["files", "write", "sbx_123", "/workspace/a", "hello", "extra"],
        command: "files write",
      },
      {
        argv: ["artifacts", "create", "sbx_123", "/workspace/a", "extra"],
        command: "artifacts create",
      },
      {
        argv: ["artifacts", "download", "art_123", "--output", downloadPath, "extra"],
        command: "artifacts download",
      },
      {
        argv: ["artifacts", "delete", "art_123", "extra"],
        command: "artifacts delete",
      },
      {
        argv: ["previews", "create", "sbx_123", "--port", "8080", "extra"],
        command: "previews create",
      },
      {
        argv: ["previews", "revoke", "prv_123", "extra"],
        command: "previews revoke",
      },
    ];

    for (const testCase of mutationCases) {
      const fetchMock = vi.fn<typeof fetch>();
      const result = await runCli(testCase.argv, environment, fetchMock);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain(
        `unexpected argument for ${testCase.command}: extra`,
      );
      expect(fetchMock, testCase.command).not.toHaveBeenCalled();
    }
  });

  it("rejects leading flags as command sandbox ids before making a request", async () => {
    const environment = {
      CROWNEST_API_KEY: "cn_live_test",
      CROWNEST_API_URL: "https://api.test",
    };
    const commandCases: readonly (readonly string[])[] = [
      ["commands", "run", "--bogus", "--", "echo", "hi"],
      ["commands", "start", "--json", "--", "echo", "hi"],
    ];

    for (const argv of commandCases) {
      const fetchMock = vi.fn<typeof fetch>();
      const result = await runCli(argv, environment, fetchMock);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("sandbox id must start with sbx_.");
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("requires the command separator before command execution mutates", async () => {
    const environment = {
      CROWNEST_API_KEY: "cn_live_test",
      CROWNEST_API_URL: "https://api.test",
    };
    const commandCases: readonly (readonly string[])[] = [
      ["commands", "run", "sbx_123", "--templte", "python"],
      ["commands", "start", "sbx_123", "--json", "echo", "hi"],
    ];

    for (const argv of commandCases) {
      const fetchMock = vi.fn<typeof fetch>();
      const result = await runCli(argv, environment, fetchMock);

      expect(result.exitCode).toBe(2);
      expect(result.stderr).toContain("command separator is required");
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it("accepts dash-prefixed string flag values", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          'event: complete\ndata: {"type":"complete","data":{"sandboxId":"sbx_123","contextId":"cctx_123","language":"python","executionCount":1,"stdout":[],"stderr":[],"outputs":[]}}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
      );
    const result = await runCli(
      ["code", "run", "sbx_123", "--code", "-1"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      code: "-1",
    });
  });

  it("accepts explicit inline string flag values that start with double dash", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          'event: complete\ndata: {"type":"complete","data":{"sandboxId":"sbx_123","contextId":"cctx_123","language":"python","executionCount":1,"stdout":[],"stderr":[],"outputs":[]}}\n\n',
          { headers: { "content-type": "text/event-stream" } },
        ),
      );
    const result = await runCli(
      ["code", "run", "sbx_123", "--code=--help"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toMatchObject({
      code: "--help",
    });
  });

  it("prints list output as a compact JSON envelope with --json", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
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
          },
        ],
        hasMore: false,
      }),
    );
    const result = await runCli(
      ["sandboxes", "list", "--json"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout) as unknown).toMatchObject({
      data: [{ id: "sbx_123", status: "ready" }],
    });
    expect(result.stdout).not.toContain("\n ");
  });

  it("renders structured API errors with code, status, and details", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "quota_exceeded",
            details: { limit: 3 },
            message: "Sandbox quota exceeded.",
          },
        }),
        { headers: { "content-type": "application/json" }, status: 403 },
      ),
    );
    const result = await runCli(
      ["projects", "list"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("error[quota_exceeded]: Sandbox quota exceeded.");
    expect(result.stderr).toContain("status: 403");
    expect(result.stderr).toContain('"limit": 3');
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}

/* eslint-enable max-lines, max-lines-per-function -- End CLI surface fixture exception. */
