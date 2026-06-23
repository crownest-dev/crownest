import { describe, expect, it } from "vitest";

import { isResourceId, ResourceIdPrefix } from "../ids";

describe("resource IDs", () => {
  it("accepts canonical CrowNest public ID prefixes", () => {
    expect(isResourceId("prj_123")).toBe(true);
    expect(isResourceId("sbx_123")).toBe(true);
    expect(isResourceId("wsr_123")).toBe(true);
    expect(ResourceIdPrefix.Project).toBe("prj");
    expect(ResourceIdPrefix.WorkspaceRun).toBe("wsr");
  });

  it("rejects unknown or incomplete IDs", () => {
    expect(isResourceId("proj_123")).toBe(false);
    expect(isResourceId("sbx_")).toBe(false);
    expect(isResourceId("sbx")).toBe(false);
  });
});
