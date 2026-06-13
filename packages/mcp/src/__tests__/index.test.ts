import { describe, expect, it, vi } from "vitest";

import { createCleanupRunner } from "../index";

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
