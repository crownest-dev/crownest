import { describe, expect, it, vi } from "vitest";

import { runCli } from "../index";

describe("keys list", () => {
  it("lists API keys through the human command route", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        data: [
          {
            createdAt: "2026-06-09T15:30:00.000Z",
            createdByUserId: "usr_owner",
            id: "key_123",
            last4: "1234",
            name: "CLI key",
            orgId: "org_123",
            prefix: "cnk_live_123",
            scopes: ["sandbox:read"],
          },
        ],
        hasMore: false,
      }),
    );
    const result = await runCli(
      ["keys", "list", "--json"],
      {
        CROWNEST_API_URL: "https://api.test",
        CROWNEST_ORG_ID: "org_123",
        CROWNEST_ROLE: "owner",
        CROWNEST_USER_ID: "usr_owner",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout) as unknown).toMatchObject({
      data: [{ id: "key_123", name: "CLI key" }],
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    expect(init).toMatchObject({
      headers: {
        "x-crownest-org-id": "org_123",
        "x-crownest-role": "owner",
        "x-crownest-user-id": "usr_owner",
      },
      method: "GET",
    });
  });

  it("renders structured API errors", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: "not_authorized",
            details: { role: "viewer" },
            message: "Owner role required.",
          },
        }),
        { headers: { "content-type": "application/json" }, status: 403 },
      ),
    );
    const result = await runCli(
      ["keys", "list"],
      {
        CROWNEST_API_URL: "https://api.test",
        CROWNEST_ORG_ID: "org_123",
        CROWNEST_ROLE: "owner",
        CROWNEST_USER_ID: "usr_viewer",
      },
      fetchMock,
    );

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain("error[not_authorized]: Owner role required.");
    expect(result.stderr).toContain("status: 403");
    expect(result.stderr).toContain('"role": "viewer"');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status: 200,
  });
}
