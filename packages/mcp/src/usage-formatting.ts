import type { CrowNestClient } from "@crownest/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { textResult } from "./formatting";
import type { McpSessionSnapshot } from "./session";

type UsageSummary = Awaited<ReturnType<CrowNestClient["usage"]>>;

export function formatUsageSummary(
  usage: UsageSummary,
  session: McpSessionSnapshot,
): CallToolResult {
  return textResult(
    [
      "usage:",
      `  period_start: ${usage.period.start}`,
      `  period_end: ${usage.period.end}`,
      `  reset_at: ${usage.period.resetAt}`,
      `  pricing_version: ${usage.pricingVersion}`,
      `  compute_unit_seconds_used: ${usage.computeUnitSeconds.used}`,
      `  compute_unit_seconds_per_credit: ${usage.computeUnitSecondsPerCredit}`,
      `  credits_used: ${usage.credits.used}`,
      `  credits_remaining: ${usage.credits.remaining ?? "unlimited"}`,
      "mcp_session:",
      `  active_sandbox_count: ${session.sandboxIds.length}`,
      `  default_sandbox_id: ${session.defaultSandboxId ?? ""}`,
      `  sandbox_ids: ${session.sandboxIds.join(", ")}`,
      "quotas:",
      ...formatQuotaLines(usage.quotas),
    ].join("\n") + "\n",
  );
}

function formatQuotaLines(quotas: UsageSummary["quotas"]): readonly string[] {
  const entries = Object.entries(quotas).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  if (entries.length === 0) {
    return ["  none"];
  }

  return entries.map(([name, bucket]) =>
    [
      `  ${name}:`,
      ` current=${bucket.current ?? ""}`,
      ` limit=${bucket.limit}`,
      ` remaining=${bucket.remaining ?? ""}`,
      ` reset_at=${bucket.resetAt ?? ""}`,
    ].join(""),
  );
}
