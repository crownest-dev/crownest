import { describe, expect, it } from "vitest";

import { ApiKeyScopes } from "../resources";

describe("ApiKeyScopes", () => {
  it("includes the sandbox lifecycle extension scope", () => {
    expect(ApiKeyScopes).toContain("sandbox:extend");
  });

  it("includes programmatic key management and project creation scopes", () => {
    expect(ApiKeyScopes).toContain("api_key:revoke");
    expect(ApiKeyScopes).toContain("project:create");
  });

  it("includes Workspace Run scopes without granting artifact collection", () => {
    expect(ApiKeyScopes).toContain("workspace_run:create");
    expect(ApiKeyScopes).toContain("workspace_run:read");
    expect(ApiKeyScopes).toContain("workspace_run:cancel");
    expect(ApiKeyScopes).toContain("artifact:create");
  });
});
