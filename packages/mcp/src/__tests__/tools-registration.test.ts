import { describe, expect, it } from "vitest";

import { createHarness } from "./mcp-test-helpers";

const toolNames = [
  "run_code",
  "run_command",
  "create_sandbox",
  "kill_sandbox",
  "write_file",
  "read_file",
  "list_files",
  "download_artifact",
];

describe("registerCrowNestTools", () => {
  it("registers exactly the eight v1 tools with CrowNest descriptions", () => {
    const { calls, tools } = createHarness();

    expect(calls.map((call) => call.name)).toEqual(toolNames);
    expect(calls).toHaveLength(8);
    expect(new Set(calls.map((call) => call.name)).size).toBe(8);
    expect([...tools.keys()]).toEqual(toolNames);
    expect(tools.get("run_code")?.config.description).toContain("Sandbox");
    expect(tools.get("run_code")?.config.description).toContain("/workspace");
    expect(tools.get("run_code")?.config.description).toContain(
      "variables/imports persist",
    );
    expect(tools.get("download_artifact")?.config.description).toContain("Artifact");
  });

  it("accepts empty arguments for all-optional tools", () => {
    const { tools } = createHarness();

    expect(parseToolInput(tools, "create_sandbox", {})).toEqual({});
    expect(parseToolInput(tools, "list_files", {})).toEqual({});
  });
});

function parseToolInput(
  tools: ReadonlyMap<string, { readonly config: { readonly inputSchema?: unknown } }>,
  name: string,
  input: unknown,
): unknown {
  const schema = tools.get(name)?.config.inputSchema;
  if (!isSafeParsableSchema(schema)) {
    throw new Error(`Tool ${name} does not expose a parsable input schema.`);
  }

  const result = schema.safeParse(input);
  if (!result.success) {
    throw new Error(`Tool ${name} rejected input.`);
  }

  return result.data;
}

function isSafeParsableSchema(
  value: unknown,
): value is { readonly safeParse: (input: unknown) => SafeParseResult } {
  return (
    typeof value === "object" &&
    value !== null &&
    "safeParse" in value &&
    typeof value.safeParse === "function"
  );
}

type SafeParseResult =
  | { readonly data: unknown; readonly success: true }
  | { readonly success: false };
