import { describe, expect, it, vi } from "vitest";

import {
  createCleanupRunner,
  createCrowNestMcpServer,
  CROWNEST_MCP_INSTRUCTIONS,
  helpText,
} from "../index";

describe("createCrowNestMcpServer", () => {
  it("constructs the SDK server with CrowNest usage instructions", () => {
    const server = createCrowNestMcpServer("0.1.0");
    const underlying = server.server as unknown as { readonly _instructions?: string };

    expect(CROWNEST_MCP_INSTRUCTIONS).toContain("lazy default Sandbox");
    expect(CROWNEST_MCP_INSTRUCTIONS).toContain("/workspace");
    expect(CROWNEST_MCP_INSTRUCTIONS).toContain("idempotency");
    expect(CROWNEST_MCP_INSTRUCTIONS).toContain("get_usage");
    expect(underlying._instructions).toBe(CROWNEST_MCP_INSTRUCTIONS);
  });
});

describe("helpText", () => {
  it("prints usage without requiring an API key", () => {
    expect(helpText("0.1.0")).toContain("@crownest/mcp 0.1.0");
    expect(helpText("0.1.0")).toContain("crownest-mcp");
    expect(helpText("0.1.0")).toContain("CROWNEST_API_KEY");
  });
});

describe("createCleanupRunner", () => {
  it("awaits cleanup before exiting and runs cleanup once", async () => {
    const order: string[] = [];
    let finishCleanup: (() => void) | undefined;
    const cleanup = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishCleanup = () => {
            order.push("cleanup");
            resolve();
          };
        }),
    );
    const exit = vi.fn((code: number) => {
      order.push(`exit:${code}`);
    });
    const runCleanup = createCleanupRunner({ cleanup }, exit);

    const first = runCleanup(130);
    const second = runCleanup(143);

    expect(exit).not.toHaveBeenCalled();
    finishCleanup?.();
    await Promise.all([first, second]);

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(130);
    expect(exit).toHaveBeenCalledWith(143);
    expect(order).toEqual(["cleanup", "exit:130", "exit:143"]);
  });
});
