import { saveCredentialConfig } from "./credential-config";
import type { CliEnvironment, CliResult } from "./index";

type ApiKeyScope = (typeof ApiKeyScopes)[number];

type HumanSession = {
  readonly orgId: `org_${string}`;
  readonly role: "admin" | "owner";
  readonly userId: `usr_${string}`;
};

export function loginCommand(
  args: readonly string[],
  environment: CliEnvironment,
): CliResult {
  const apiKey = optionValue(args, "--api-key") ?? environment.CROWNEST_API_KEY;
  const apiUrl =
    optionValue(args, "--api-url") ??
    environment.CROWNEST_API_URL ??
    "https://api.crownest.dev";

  if (apiKey) {
    saveCredentialConfig(environment, { apiKey, apiUrl });

    return ok(`Saved CrowNest credentials for ${apiUrl}.\n`);
  }

  return ok(
    [
      "Create an API key at https://crownest.dev, then run:",
      `crownest login --api-url ${apiUrl} --api-key cn_live_...`,
      "",
      "You can also set CROWNEST_API_KEY and run crownest login to save it.",
      "",
    ].join("\n"),
  );
}

export async function createApiKeyCommand(
  args: readonly string[],
  environment: CliEnvironment,
  fetchImpl: typeof fetch = fetch,
): Promise<CliResult> {
  const session = humanSession(environment, "keys create");
  const response = await fetchImpl(`${apiBaseUrl(args, environment)}/v1/api-keys`, {
    body: JSON.stringify(createApiKeyBody(args)),
    headers: {
      "content-type": "application/json",
      "x-crownest-org-id": session.orgId,
      "x-crownest-role": session.role,
      "x-crownest-user-id": session.userId,
    },
    method: "POST",
  });
  const payload = (await response.json()) as {
    readonly error?: { readonly message: string };
    readonly secret?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "API key creation failed.");
  }

  return ok(`${payload.secret ?? ""}\n`);
}

export async function listApiKeysCommand(
  args: readonly string[],
  environment: CliEnvironment,
  fetchImpl: typeof fetch = fetch,
): Promise<CliResult> {
  const session = humanSession(environment, "keys list");
  const response = await fetchImpl(`${apiBaseUrl(args, environment)}/v1/api-keys`, {
    headers: {
      "x-crownest-org-id": session.orgId,
      "x-crownest-role": session.role,
      "x-crownest-user-id": session.userId,
    },
    method: "GET",
  });
  const payload = (await response.json()) as {
    readonly data?: readonly unknown[];
    readonly error?: { readonly message: string };
  };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "API key listing failed.");
  }

  return ok(`${JSON.stringify({ data: payload.data ?? [] }, null, 2)}\n`);
}

function createApiKeyBody(args: readonly string[]) {
  const name = optionValue(args, "--name") ?? "CLI key";
  const projectId = optionValue(args, "--project");
  const scopes = scopeOptions(args);

  return {
    name,
    ...(projectId === undefined ? {} : { projectIds: [projectId] }),
    scopes: scopes.length === 0 ? quickstartDeveloperScopes : scopes,
  };
}

function scopeOptions(args: readonly string[]): readonly ApiKeyScope[] {
  const scopes: ApiKeyScope[] = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--scope") {
      const scope = requiredArg(args[index + 1], "scope");
      if (!(ApiKeyScopes as readonly string[]).includes(scope)) {
        throw new Error(`invalid API key scope: ${scope}`);
      }
      scopes.push(scope as ApiKeyScope);
    }
  }

  return scopes;
}

function humanSession(environment: CliEnvironment, command: string): HumanSession {
  const orgId = environment.CROWNEST_ORG_ID;
  const role = environment.CROWNEST_ROLE;
  const userId = environment.CROWNEST_USER_ID;

  if (!orgId?.startsWith("org_") || !userId?.startsWith("usr_")) {
    throw new Error(
      `CROWNEST_ORG_ID and CROWNEST_USER_ID are required for ${command}.`,
    );
  }

  if (role !== "owner" && role !== "admin") {
    throw new Error(`CROWNEST_ROLE must be owner or admin for ${command}.`);
  }

  return { orgId: orgId as `org_${string}`, role, userId: userId as `usr_${string}` };
}

function apiBaseUrl(args: readonly string[], environment: CliEnvironment): string {
  return (
    optionValue(args, "--api-url") ??
    environment.CROWNEST_API_URL ??
    "http://127.0.0.1:8787"
  ).replace(/\/$/, "");
}

function optionValue(args: readonly (string | undefined)[], flag: string) {
  const index = args.indexOf(flag);
  return index < 0 ? undefined : args[index + 1];
}

function requiredArg(value: string | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label} is required.`);
  }

  return value;
}

function ok(stdout: string): CliResult {
  return { exitCode: 0, stderr: "", stdout };
}

const quickstartDeveloperScopes = [
  "sandbox:create",
  "sandbox:read",
  "sandbox:kill",
  "sandbox:extend",
  "command:run",
  "command:read",
  "command:cancel",
  "code:run",
  "file:read",
  "file:write",
  "artifact:create",
  "artifact:read",
  "artifact:delete",
  "preview:create",
  "preview:read",
  "preview:revoke",
] as const satisfies readonly ApiKeyScope[];

const ApiKeyScopes = [
  "sandbox:create",
  "sandbox:read",
  "sandbox:kill",
  "sandbox:extend",
  "command:run",
  "command:read",
  "command:cancel",
  "code:run",
  "file:read",
  "file:write",
  "artifact:create",
  "artifact:read",
  "artifact:delete",
  "preview:create",
  "preview:read",
  "preview:revoke",
  "backup:create",
  "backup:read",
  "backup:restore",
  "backup:delete",
  "usage:read",
  "api_key:read",
] as const;
