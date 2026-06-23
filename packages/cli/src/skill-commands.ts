import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  booleanFlag,
  jsonFlagSpec,
  parseFlags,
  rejectExtraPositionals,
  stringFlag,
  UsageError,
} from "./flags";
import type { CliEnvironment, CliResult } from "./index";
import { jsonEnvelope, renderRecord } from "./output";

const skillName = "crownest";
const bundledSkillPath = fileURLToPath(new URL("../skills/crownest/", import.meta.url));

type SkillInstallScope = "project" | "user";

export async function installSkillCommand(
  args: readonly string[],
  environment: CliEnvironment,
): Promise<CliResult> {
  const parsed = parseFlags(args, {
    "--dry-run": "boolean",
    "--force": "boolean",
    "--scope": "string",
    ...jsonFlagSpec,
  });
  rejectExtraPositionals(parsed.positionals, "skills install");

  const scope = skillInstallScope(stringFlag(parsed.flags, "--scope"));
  const destination = skillDestination(scope, environment);
  const alreadyExists = await pathExists(destination);
  const dryRun = booleanFlag(parsed.flags, "--dry-run");
  const force = booleanFlag(parsed.flags, "--force");

  if (!dryRun) {
    if (alreadyExists && !force) {
      throw new UsageError(
        `CrowNest skill already exists at ${destination}. Use --force to replace it.`,
      );
    }
    if (alreadyExists) {
      await rm(destination, { force: true, recursive: true });
    }
    await mkdir(dirname(destination), { recursive: true });
    await cp(bundledSkillPath, destination, { recursive: true });
  }

  return ok(
    output(
      {
        alreadyExists,
        destination,
        dryRun,
        installed: !dryRun,
        scope,
        skill: skillName,
      },
      booleanFlag(parsed.flags, "--json"),
    ),
  );
}

function skillInstallScope(value: string | undefined): SkillInstallScope {
  if (value === undefined || value === "user") return "user";
  if (value === "project") return "project";
  throw new UsageError("--scope must be user or project.");
}

function skillDestination(
  scope: SkillInstallScope,
  environment: CliEnvironment,
): string {
  if (scope === "project") {
    return join(process.cwd(), ".agents", "skills", skillName);
  }

  if (!environment.HOME) {
    throw new UsageError("HOME is required for user skill installation.");
  }

  return join(environment.HOME, ".agents", "skills", skillName);
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (isNodeErrorCode(error, "ENOENT")) {
      return false;
    }
    throw error;
  }
}

function isNodeErrorCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
}

function output(record: object, json: boolean): string {
  return json ? jsonEnvelope(record) : renderRecord(record);
}

function ok(stdout: string): CliResult {
  return { exitCode: 0, stderr: "", stdout };
}
