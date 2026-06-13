import { describe, expect, it } from "vitest";

import { ApiKeyScopes } from "../resources";

describe("ApiKeyScopes", () => {
  it("includes the sandbox lifecycle extension scope", () => {
    expect(ApiKeyScopes).toContain("sandbox:extend");
  });
});
