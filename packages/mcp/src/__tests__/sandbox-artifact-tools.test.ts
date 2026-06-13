import { CrowNestApiError } from "@crownest/sdk";
import { describe, expect, it } from "vitest";

import { callTool, createHarness, createSandboxHandle, text } from "./mcp-test-helpers";

describe("Sandbox and Artifact tools", () => {
  it("creates and kills session Sandboxes", async () => {
    const sandbox = createSandboxHandle("sbx_created");
    const { tools } = createHarness([sandbox]);

    const created = await callTool(tools, "create_sandbox", { ttl_ms: 60_000 });
    const killed = await callTool(tools, "kill_sandbox", {
      sandbox_id: "sbx_created",
    });

    expect(text(created)).toContain('"sandbox_id": "sbx_created"');
    expect(sandbox.mocks.kill).toHaveBeenCalledTimes(1);
    expect(text(killed)).toContain('"killed": true');
  });

  it("downloads Artifacts as base64 with content type fallback", async () => {
    const sandbox = createSandboxHandle("sbx_default");
    const { client, tools } = createHarness([sandbox]);
    client.mocks.getArtifact.mockResolvedValueOnce(artifact());
    client.mocks.downloadArtifact.mockResolvedValueOnce(new Uint8Array([104, 105]));

    const result = await callTool(tools, "download_artifact", {
      artifact_id: "art_123",
    });

    expect(client.mocks.getArtifact).toHaveBeenCalledWith("art_123");
    expect(client.mocks.downloadArtifact).toHaveBeenCalledWith("art_123");
    expect(text(result)).toContain('"content_base64": "aGk="');
    expect(text(result)).toContain('"content_type": "application/octet-stream"');
  });

  it("maps CrowNest API errors to MCP tool error results", async () => {
    const sandbox = createSandboxHandle("sbx_error");
    sandbox.mocks.commandRun.mockRejectedValueOnce(
      new CrowNestApiError(401, { code: "unauthorized", message: "bad key" }),
    );
    const { tools } = createHarness([sandbox]);

    const result = await callTool(tools, "run_command", { command: "pwd" });

    expect(result.isError).toBe(true);
    expect(text(result)).toBe("unauthorized: bad key");
  });

  it("maps unknown Sandbox ids to stable MCP tool errors", async () => {
    const { tools } = createHarness();

    const command = await callTool(tools, "run_command", unknownCommandInput());
    const kill = await callTool(tools, "kill_sandbox", unknownKillInput());

    expect(command.isError).toBe(true);
    expect(kill.isError).toBe(true);
    expect(text(command)).toContain("unknown_sandbox_id:");
    expect(text(kill)).toContain("unknown_sandbox_id:");
  });

  it("maps non-SDK failures to internal_error without stack traces", async () => {
    const errorSandbox = createSandboxHandle("sbx_error");
    const valueSandbox = createSandboxHandle("sbx_value");
    errorSandbox.mocks.commandRun.mockRejectedValueOnce(new Error("boom"));
    valueSandbox.mocks.commandRun.mockRejectedValueOnce("bad value");
    const { tools } = createHarness([errorSandbox, valueSandbox]);

    await callTool(tools, "create_sandbox", {});
    await callTool(tools, "create_sandbox", {});
    const errorResult = await callTool(tools, "run_command", errorCommandInput());
    const valueResult = await callTool(tools, "run_command", valueCommandInput());

    expect(errorResult.isError).toBe(true);
    expect(valueResult.isError).toBe(true);
    expect(text(errorResult)).toBe("internal_error: boom");
    expect(text(valueResult)).toBe("internal_error: bad value");
    expect(text(errorResult)).not.toContain(" at ");
  });
});

function artifact() {
  return {
    createdAt: "2026-06-12T12:00:00.000Z",
    id: "art_123",
    name: "plot.png",
    objectKey: "orgs/org_123/projects/prj_123/objects/obj_123",
    orgId: "org_123",
    projectId: "prj_123",
    sandboxId: "sbx_default",
    sizeBytes: 2,
  };
}

function unknownCommandInput() {
  return { command: "pwd", sandbox_id: "sbx_missing" };
}

function unknownKillInput() {
  return { sandbox_id: "sbx_missing" };
}

function errorCommandInput() {
  return { command: "pwd", sandbox_id: "sbx_error" };
}

function valueCommandInput() {
  return { command: "pwd", sandbox_id: "sbx_value" };
}
