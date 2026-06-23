import { describe, expect, it } from "vitest";

import {
  legacyBetaPlanLimits,
  PLAN_LIMITS,
  planLimitsForTier,
  planTiers,
} from "../plan-limits";

describe("PLAN_LIMITS", () => {
  it("defines every tier with complete numeric limits", () => {
    expect(Object.keys(PLAN_LIMITS).sort()).toEqual([...planTiers].sort());

    for (const tier of planTiers) {
      for (const value of Object.values(PLAN_LIMITS[tier])) {
        expect(value).toEqual(expect.any(Number));
        expect(value).toBeGreaterThan(0);
      }
    }
  });

  it("keeps concurrency as the upgrade lever", () => {
    expect(PLAN_LIMITS.free.maxConcurrentSandboxes).toBeLessThan(
      PLAN_LIMITS.builder.maxConcurrentSandboxes,
    );
    expect(PLAN_LIMITS.builder.maxConcurrentSandboxes).toBeLessThan(
      PLAN_LIMITS.scale.maxConcurrentSandboxes,
    );
    expect(PLAN_LIMITS.scale.maxConcurrentSandboxes).toBeLessThan(
      PLAN_LIMITS.enterprise.maxConcurrentSandboxes,
    );
  });

  it("keeps preview and direct-write caps uniform", () => {
    const caps = planTiers.map((tier) => ({
      maxActivePreviewsPerOrg: PLAN_LIMITS[tier].maxActivePreviewsPerOrg,
      maxActivePreviewsPerSandbox: PLAN_LIMITS[tier].maxActivePreviewsPerSandbox,
      maxDirectFileWriteBytes: PLAN_LIMITS[tier].maxDirectFileWriteBytes,
    }));

    expect(new Set(caps.map((cap) => JSON.stringify(cap))).size).toBe(1);
  });

  it("keeps enterprise enforcement concrete", () => {
    expect(PLAN_LIMITS.enterprise).toMatchObject({
      artifactRetentionDays: 365,
      maxConcurrentSandboxes: 250,
      maxSandboxSessionTtlMs: 168 * 60 * 60_000,
    });
  });

  it("keeps legacy beta behavior available during migration", () => {
    expect(legacyBetaPlanLimits).toMatchObject({
      artifactRetentionDays: 30,
      maxActivePreviewsPerOrg: 10,
      maxActivePreviewsPerSandbox: 3,
      maxConcurrentSandboxes: 3,
      maxDirectFileWriteBytes: 256 * 1024,
      maxSandboxCreateTtlMs: 60 * 60_000,
      maxSandboxExtendTtlMs: 24 * 60 * 60_000,
      maxSandboxSessionTtlMs: 24 * 60 * 60_000,
    });
  });

  it("fails closed to Free for missing tiers", () => {
    expect(planLimitsForTier(undefined)).toBe(PLAN_LIMITS.free);
  });
});
