import { describe, expect, it, vi } from "vitest";

import { runCli } from "../index";

describe("keys create", () => {
  it("includes code execution in the default Quickstart Developer scopes", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        secret: "cn_live_created",
      }),
    );
    const result = await runCli(
      ["keys", "create", "--name", "Quickstart Developer"],
      humanEnvironment(),
      fetchMock,
    );

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: "cn_live_created\n",
    });
    const body = requestBody(fetchMock);
    expect(body.name).toBe("Quickstart Developer");
    expect(body.scopes).toContain("command:run");
    expect(body.scopes).toContain("code:run");
  });

  it("accepts code:run as an explicit API key scope", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        secret: "cn_live_created",
      }),
    );
    const result = await runCli(
      ["keys", "create", "--scope", "code:run"],
      humanEnvironment(),
      fetchMock,
    );

    expect(result.exitCode).toBe(0);
    expect(requestBody(fetchMock)).toMatchObject({
      scopes: ["code:run"],
    });
  });
});

function humanEnvironment() {
  return {
    CROWNEST_API_URL: "https://api.test",
    CROWNEST_ORG_ID: "org_123",
    CROWNEST_ROLE: "owner",
    CROWNEST_USER_ID: "usr_owner",
  } as const;
}

function requestBody(fetchMock: ReturnType<typeof vi.fn<typeof fetch>>) {
  const [, init] = fetchMock.mock.calls[0] ?? [];
  const body = init?.body;

  if (typeof body !== "string") {
    throw new Error("expected JSON request body");
  }

  return JSON.parse(body) as Record<string, unknown>;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
