import { describe, expect, it } from "vitest";

import packageJson from "../../package.json";
import { canonicalCliCommands, runCli } from "../index";

describe("CLI help", () => {
  it("prints global help with every canonical command", async () => {
    const result = await runCli(["--help"]);

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    for (const command of canonicalCliCommands) {
      expect(result.stdout).toContain(command);
    }
    expect(result.stdout).toContain("Exit codes:");
    expect(result.stdout).toContain("0  success");
    expect(result.stdout).toContain("1  API or runtime error");
    expect(result.stdout).toContain("2  usage error");
  });

  it("prints the package version", async () => {
    const result = await runCli(["--version"]);

    expect(result).toEqual({
      exitCode: 0,
      stderr: "",
      stdout: `${packageJson.version}\n`,
    });
    expect(result.stdout).toMatch(/^\d+\.\d+\.\d+\n$/);
  });

  it("prints command-specific help", async () => {
    const result = await runCli(["sandboxes", "create", "--help"]);

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout).toContain("crownest sandboxes create");
    expect(result.stdout).toContain("--template");
    expect(result.stdout).toContain("--json");
    expect(result.stdout).toContain("Exit codes:");
  });

  it("prints command-specific help through the help command", async () => {
    const result = await runCli(["help", "commands", "run"]);

    expect(result).toMatchObject({ exitCode: 0, stderr: "" });
    expect(result.stdout).toContain("crownest commands run");
    expect(result.stdout).toContain("--collect");
  });
});
