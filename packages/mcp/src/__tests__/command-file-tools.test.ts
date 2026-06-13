import { describe, expect, it } from "vitest";

import { callTool, createHarness, createSandboxHandle, text } from "./mcp-test-helpers";

describe("command and file tools", () => {
  it("runs Commands with optional cwd and timeout", async () => {
    const sandbox = createSandboxHandle("sbx_command");
    sandbox.mocks.commandRun.mockResolvedValueOnce(commandResult("sbx_command"));
    const { tools } = createHarness([sandbox]);

    const result = await callTool(tools, "run_command", {
      command: "pwd",
      cwd: "/workspace/app",
      timeout_ms: 500,
    });

    expect(sandbox.mocks.commandRun).toHaveBeenCalledWith("pwd", {
      cwd: "/workspace/app",
      timeoutMs: 500,
    });
    expect(text(result)).toContain("exit_code: 0");
    expect(text(result)).toContain("stdout:\n");
    expect(text(result)).toContain("stderr:\n");
  });

  it("writes, reads, and lists Workspace files", async () => {
    const sandbox = createSandboxHandle("sbx_files");
    sandbox.mocks.fileWrite.mockResolvedValueOnce(fileStat());
    sandbox.mocks.fileRead.mockResolvedValueOnce("hello");
    sandbox.mocks.fileList.mockResolvedValueOnce([fileEntry()]);
    const { tools } = createHarness([sandbox]);

    await callTool(tools, "write_file", fileInput());
    const read = await callTool(tools, "read_file", { path: "/workspace/a.txt" });
    const list = await callTool(tools, "list_files", { path: "/workspace" });

    expect(sandbox.mocks.fileWrite).toHaveBeenCalledWith("/workspace/a.txt", "hello", {
      encoding: "utf8",
    });
    expect(sandbox.mocks.fileRead).toHaveBeenCalledWith("/workspace/a.txt", {
      encoding: "utf8",
    });
    expect(sandbox.mocks.fileList).toHaveBeenCalledWith("/workspace");
    expect(text(read)).toContain('"content": "hello"');
    expect(text(list)).toContain('"sandbox_id": "sbx_files"');
  });

  it("routes stateful tools to an explicit non-default Sandbox id", async () => {
    const defaultSandbox = createSandboxHandle("sbx_default");
    const explicitSandbox = createSandboxHandle("sbx_explicit");
    explicitSandbox.mocks.commandRun.mockResolvedValueOnce(
      commandResult("sbx_explicit"),
    );
    explicitSandbox.mocks.fileRead.mockResolvedValueOnce("hello");
    const { tools } = createHarness([defaultSandbox, explicitSandbox]);

    await callTool(tools, "create_sandbox", {});
    await callTool(tools, "create_sandbox", {});
    const command = await callTool(tools, "run_command", explicitCommandInput());
    const file = await callTool(tools, "read_file", explicitReadInput());

    expect(defaultSandbox.mocks.commandRun).not.toHaveBeenCalled();
    expect(defaultSandbox.mocks.fileRead).not.toHaveBeenCalled();
    expect(explicitSandbox.mocks.commandRun).toHaveBeenCalledWith("pwd", {});
    expect(explicitSandbox.mocks.fileRead).toHaveBeenCalledWith("/workspace/a.txt", {
      encoding: "utf8",
    });
    expect(text(command)).toContain("sandbox_id: sbx_explicit");
    expect(text(file)).toContain('"sandbox_id": "sbx_explicit"');
  });
});

function commandResult(sandboxId: `sbx_${string}`) {
  return {
    command: "pwd",
    cwd: "/workspace",
    env: {},
    exitCode: 0,
    id: "cmd_123",
    sandboxId,
    status: "exited",
  };
}

function fileInput() {
  return {
    content: "hello",
    path: "/workspace/a.txt",
  };
}

function explicitCommandInput() {
  return {
    command: "pwd",
    sandbox_id: "sbx_explicit",
  };
}

function explicitReadInput() {
  return {
    path: "/workspace/a.txt",
    sandbox_id: "sbx_explicit",
  };
}

function fileStat() {
  return {
    path: "/workspace/a.txt",
    sizeBytes: 5,
    type: "file",
  };
}

function fileEntry() {
  return {
    name: "a.txt",
    path: "/workspace/a.txt",
    sizeBytes: 5,
    type: "file",
  };
}
