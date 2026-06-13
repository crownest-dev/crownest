import { afterEach, describe, expect, it, vi } from "vitest";

import { createCrowNestClient } from "../index";
import { CrowNestApiError } from "../protocol";

describe("transport hardening", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("fails fast at construction when no API key is available", () => {
    vi.stubEnv("CROWNEST_API_KEY", "");

    expect(() => createCrowNestClient({})).toThrow(/CROWNEST_API_KEY/);
  });

  it("falls back to the CROWNEST_API_KEY environment variable", async () => {
    vi.stubEnv("CROWNEST_API_KEY", "cnk_env_key");
    const fetchSpy = jsonFetch({ data: [] });
    const client = createCrowNestClient({ fetch: fetchSpy });

    await client.sandboxes.list();

    expect(headerFromCall(fetchSpy, "authorization")).toBe("Bearer cnk_env_key");
  });

  it("prefers the explicit apiKey option over the environment", async () => {
    vi.stubEnv("CROWNEST_API_KEY", "cnk_env_key");
    const fetchSpy = jsonFetch({ data: [] });
    const client = createCrowNestClient({ apiKey: "cnk_option_key", fetch: fetchSpy });

    await client.sandboxes.list();

    expect(headerFromCall(fetchSpy, "authorization")).toBe("Bearer cnk_option_key");
  });

  it("wraps non-JSON error bodies in a structured CrowNestApiError", async () => {
    const fetchSpy = vi.fn().mockResolvedValue(
      new Response("<html>Bad Gateway</html>", {
        headers: { "content-type": "text/html" },
        status: 502,
      }),
    );
    const client = createCrowNestClient({ apiKey: "cnk_test_key", fetch: fetchSpy });

    const failure = await client.sandboxes.list().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CrowNestApiError);
    expect(failure).toMatchObject({
      code: "invalid_error_response",
      status: 502,
    });
  });

  it("still parses structured JSON error envelopes", async () => {
    const fetchSpy = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ error: { code: "not_found", message: "Missing." } }),
          { headers: { "content-type": "application/json" }, status: 404 },
        ),
      );
    const client = createCrowNestClient({ apiKey: "cnk_test_key", fetch: fetchSpy });

    const failure = await client.sandboxes.list().catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(CrowNestApiError);
    expect(failure).toMatchObject({ code: "not_found", status: 404 });
  });
});

function jsonFetch(body: unknown) {
  return vi.fn().mockResolvedValue(
    new Response(JSON.stringify(body), {
      headers: { "content-type": "application/json" },
      status: 200,
    }),
  );
}

function headerFromCall(fetchSpy: ReturnType<typeof vi.fn>, name: string) {
  const init = fetchSpy.mock.calls[0]?.[1] as { headers?: Headers } | undefined;
  return init?.headers instanceof Headers ? init.headers.get(name) : undefined;
}
