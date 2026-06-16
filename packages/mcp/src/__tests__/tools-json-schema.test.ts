import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { createHarness } from "./mcp-test-helpers";

/**
 * Regression for the production MCP outage: tool input schemas built with
 * `z.custom()` have no JSON Schema representation, so MCP `tools/list` (which
 * serializes every tool's input schema) failed with
 * "Custom types cannot be represented in JSON Schema" and the server exposed
 * zero usable tools. These tests serialize each tool schema the same way the
 * MCP SDK does and assert it succeeds.
 */
describe("MCP tool input schemas are JSON-Schema representable", () => {
  it("every registered tool inputSchema converts without throwing", () => {
    const { tools } = createHarness();

    expect(tools.size).toBeGreaterThan(0);
    for (const [name, tool] of tools) {
      expect(
        () => z.toJSONSchema(tool.config.inputSchema as never),
        `tool ${name} input schema must serialize`,
      ).not.toThrow();
    }
  });

  it("represents the sandbox id as a pattern-constrained string", () => {
    const { tools } = createHarness();

    const schema = z.toJSONSchema(
      tools.get("run_code")?.config.inputSchema as never,
    ) as { readonly properties?: Record<string, { readonly pattern?: string }> };

    expect(schema.properties?.sandbox_id?.pattern).toContain("sbx_");
  });
});
