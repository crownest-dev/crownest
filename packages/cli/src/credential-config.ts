import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { CliEnvironment } from "./index";

export type CliCredentialConfig = {
  readonly apiKey?: string;
  readonly apiUrl?: string;
  readonly credential?: string;
};

export function loadCredentialConfig(environment: CliEnvironment): CliCredentialConfig {
  const configPath = credentialConfigPath(environment);

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as unknown;
    if (!isCredentialConfig(parsed)) {
      return {};
    }

    return parsed;
  } catch {
    return {};
  }
}

export function saveCredentialConfig(
  environment: CliEnvironment,
  config: Required<Pick<CliCredentialConfig, "apiUrl">> &
    Pick<CliCredentialConfig, "apiKey" | "credential">,
): void {
  const configPath = credentialConfigPath(environment);
  const tempPath = `${configPath}.tmp`;
  mkdirSync(dirname(configPath), { recursive: true });
  writeFileSync(tempPath, `${JSON.stringify(config, null, 2)}\n`, {
    mode: 0o600,
  });
  renameSync(tempPath, configPath);
}

function credentialConfigPath(environment: CliEnvironment): string {
  if (environment.CROWNEST_CONFIG_PATH) {
    return environment.CROWNEST_CONFIG_PATH;
  }

  const configHome =
    environment.XDG_CONFIG_HOME ?? join(environment.HOME ?? homedir(), ".config");

  return join(configHome, "crownest", "config.json");
}

function isCredentialConfig(value: unknown): value is CliCredentialConfig {
  if (!isObject(value)) {
    return false;
  }

  return optionalString(value.apiKey) && optionalString(value.apiUrl);
}

function optionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
