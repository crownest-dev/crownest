export const planTiers = ["free", "builder", "scale", "enterprise"] as const;

export type PlanTier = (typeof planTiers)[number];

export type PlanLimitSet = {
  readonly artifactRetentionDays: number;
  readonly maxActivePreviewsPerOrg: number;
  readonly maxActivePreviewsPerSandbox: number;
  readonly maxConcurrentSandboxes: number;
  readonly maxDirectFileWriteBytes: number;
  readonly maxSandboxCreateTtlMs: number;
  readonly maxSandboxExtendTtlMs: number;
  readonly maxSandboxSessionTtlMs: number;
};

const hourMs = 60 * 60_000;

export const sandboxHourUsd = 0.12;
export const freeTierInitialCreditUsd = 10;
export const planIncludedUsageUsd = {
  free: freeTierInitialCreditUsd,
  builder: 20,
  scale: 100,
  enterprise: null,
} as const satisfies Record<PlanTier, number | null>;

export const PLAN_LIMITS = {
  free: {
    artifactRetentionDays: 7,
    maxActivePreviewsPerOrg: 10,
    maxActivePreviewsPerSandbox: 3,
    maxConcurrentSandboxes: 2,
    maxDirectFileWriteBytes: 256 * 1024,
    maxSandboxCreateTtlMs: hourMs,
    maxSandboxExtendTtlMs: hourMs,
    maxSandboxSessionTtlMs: hourMs,
  },
  builder: {
    artifactRetentionDays: 30,
    maxActivePreviewsPerOrg: 10,
    maxActivePreviewsPerSandbox: 3,
    maxConcurrentSandboxes: 25,
    maxDirectFileWriteBytes: 256 * 1024,
    maxSandboxCreateTtlMs: hourMs,
    maxSandboxExtendTtlMs: 24 * hourMs,
    maxSandboxSessionTtlMs: 24 * hourMs,
  },
  scale: {
    artifactRetentionDays: 90,
    maxActivePreviewsPerOrg: 10,
    maxActivePreviewsPerSandbox: 3,
    maxConcurrentSandboxes: 100,
    maxDirectFileWriteBytes: 256 * 1024,
    maxSandboxCreateTtlMs: hourMs,
    maxSandboxExtendTtlMs: 72 * hourMs,
    maxSandboxSessionTtlMs: 72 * hourMs,
  },
  enterprise: {
    artifactRetentionDays: 365,
    maxActivePreviewsPerOrg: 10,
    maxActivePreviewsPerSandbox: 3,
    maxConcurrentSandboxes: 250,
    maxDirectFileWriteBytes: 256 * 1024,
    maxSandboxCreateTtlMs: hourMs,
    maxSandboxExtendTtlMs: 168 * hourMs,
    maxSandboxSessionTtlMs: 168 * hourMs,
  },
} as const satisfies Record<PlanTier, PlanLimitSet>;

export const legacyBetaPlanLimits = {
  artifactRetentionDays: 30,
  maxActivePreviewsPerOrg: 10,
  maxActivePreviewsPerSandbox: 3,
  maxConcurrentSandboxes: 3,
  maxDirectFileWriteBytes: 256 * 1024,
  maxSandboxCreateTtlMs: hourMs,
  maxSandboxExtendTtlMs: 24 * hourMs,
  maxSandboxSessionTtlMs: 24 * hourMs,
} as const satisfies PlanLimitSet;

export function isPlanTier(value: unknown): value is PlanTier {
  return typeof value === "string" && planTiers.includes(value as PlanTier);
}

export function planLimitsForTier(tier: PlanTier | undefined): PlanLimitSet {
  return PLAN_LIMITS[tier ?? "free"];
}
