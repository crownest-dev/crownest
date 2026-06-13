import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { runCli } from "../index";

describe("Phase 5 CLI ergonomics", () => {
  registerHumanCliTests();
  registerHumanKeyCliTests();
  registerProjectCliTests();
  registerUploadCliTests();
  registerExecAliasTests();
});

function registerHumanCliTests() {
  it("prints API-key login guidance without calling the API", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await runCli(["login"], {}, fetchMock);

    expect(result).toMatchObject({
      exitCode: 0,
      stderr: "",
    });
    expect(result.stdout).toContain("Create an API key at https://crownest.dev");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("saves API-key login credentials and uses them for later commands", async () => {
    const configPath = resolve(
      mkdtempSync(resolve(tmpdir(), "crownest-cli-login-")),
      "config.json",
    );
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: [{ id: "prj_123", name: "Default Project", orgId: "org_123" }],
        hasMore: false,
      }),
    );
    const environment = {
      CROWNEST_CONFIG_PATH: configPath,
    };

    await expect(
      runCli(
        ["login", "--api-url", "https://api.test", "--api-key", "cn_live_created"],
        environment,
        fetchMock,
      ),
    ).resolves.toMatchObject({
      exitCode: 0,
      stdout: "Saved CrowNest credentials for https://api.test.\n",
    });

    const result = await runCli(["projects", "list"], environment, fetchMock);

    expect(result.exitCode).toBe(0);
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.test/v1/projects");
    expect(
      (fetchMock.mock.calls[0]?.[1]?.headers as Headers).get("authorization"),
    ).toBe("Bearer cn_live_created");
  });
}

function registerHumanKeyCliTests() {
  it("creates API keys with local human-session headers", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ secret: "cn_live_created" }));
    const result = await runCli(
      ["keys", "create", "--name", "CI", "--project", "prj_123"],
      {
        CROWNEST_API_URL: "https://api.test",
        CROWNEST_ORG_ID: "org_123",
        CROWNEST_ROLE: "owner",
        CROWNEST_USER_ID: "usr_123",
      },
      fetchMock,
    );

    expect(result).toMatchObject({ exitCode: 0, stdout: "cn_live_created\n" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.test/v1/api-keys");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
    const headers = fetchMock.mock.calls[0]?.[1]?.headers as Record<string, string>;
    expect(headers["x-crownest-org-id"]).toBe("org_123");
    expect(headers["x-crownest-role"]).toBe("owner");
    expect(headers["x-crownest-user-id"]).toBe("usr_123");
    expect(fetchMock.mock.calls[0]?.[1]?.body).toContain('"projectIds":["prj_123"]');
  });

  it("does not create API keys against the saved runtime login API URL", async () => {
    const configPath = resolve(
      mkdtempSync(resolve(tmpdir(), "crownest-cli-key-create-")),
      "config.json",
    );
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ secret: "cn_live_created" }));
    const environment = {
      CROWNEST_CONFIG_PATH: configPath,
      CROWNEST_ORG_ID: "org_123",
      CROWNEST_ROLE: "owner",
      CROWNEST_USER_ID: "usr_123",
    };

    await runCli(
      ["login", "--api-url", "https://saved-api.test", "--api-key", "cn_live_saved"],
      environment,
      fetchMock,
    );

    const result = await runCli(
      ["keys", "create", "--name", "CI", "--project", "prj_123"],
      environment,
      fetchMock,
    );

    expect(result).toMatchObject({ exitCode: 0, stdout: "cn_live_created\n" });
    expect(fetchMock.mock.calls[0]?.[0]).toBe("http://127.0.0.1:8787/v1/api-keys");
  });

  it("fails API-key creation before fetch when human env is missing", async () => {
    const fetchMock = vi.fn<typeof fetch>();
    const result = await runCli(["keys", "create"], {}, fetchMock);

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("CROWNEST_ORG_ID and CROWNEST_USER_ID");
    expect(fetchMock).not.toHaveBeenCalled();
  });
}

function registerProjectCliTests() {
  it("lists projects through the SDK transport", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            id: "prj_123",
            name: "Default Project",
            orgId: "org_123",
          },
        ],
        hasMore: false,
      }),
    );
    const result = await runCli(
      ["projects", "list"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Default Project");
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.test/v1/projects");
    expect(fetchMock.mock.calls[0]?.[1]?.method).toBe("GET");
  });
}

function registerUploadCliTests() {
  it("uploads local files with base64 direct writes", async () => {
    const localPath = resolve(
      mkdtempSync(resolve(tmpdir(), "crownest-cli-upload-")),
      "input.bin",
    );
    writeFileSync(localPath, Buffer.from([0, 1, 2, 3]));
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        file: { path: "/workspace/input.bin", sizeBytes: 4, type: "file" },
      }),
    );
    const result = await runCli(
      ["files", "upload", "sbx_123", localPath, "/workspace/input.bin"],
      {
        CROWNEST_API_KEY: "cn_live_test",
        CROWNEST_API_URL: "https://api.test",
      },
      fetchMock,
    );

    expect(result.stdout).toBe("/workspace/input.bin\n");
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.test/v1/sandboxes/sbx_123/files",
    );
    expect(JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)).toEqual({
      content: "AAECAw==",
      createParents: false,
      encoding: "base64",
      path: "/workspace/input.bin",
    });
  });
}

function registerExecAliasTests() {
  it("aliases exec to command run with collection options", async () => {
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
        "exec",
        "sbx_123",
        "--collect",
        "/workspace/output.csv",
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
      }),
    );
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
