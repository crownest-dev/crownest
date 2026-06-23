/* eslint-disable max-lines-per-function -- Transport construction keeps shared request auth behavior together. */

import type {
  ApiErrorResponse,
  CancelCommandResponse,
  Command,
  CommandCollectOn,
  CommandCollectRequest,
  CommandLogStreamEvent,
  RunCommandResponse,
} from "@crownest/contracts";

export type CrowNestClientOptions = {
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly credential?: string;
  readonly fetch?: typeof fetch;
};

export class CrowNestApiError extends Error {
  readonly code: string;
  readonly details: Readonly<Record<string, unknown>> | undefined;
  readonly status: number;

  constructor(status: number, error: ApiErrorResponse["error"]) {
    super(error.message);
    this.name = "CrowNestApiError";
    this.code = error.code;
    this.details = error.details;
    this.status = status;
  }
}

export type Transport = {
  download(url: string): Promise<Uint8Array>;
  raw(url: string, init: RawRequestInit): Promise<Response>;
  request<T>(path: string, init: ApiRequestInit): Promise<T>;
  streamSse<T>(path: string, init?: ApiStreamInit): AsyncIterable<T>;
};

export type RunCommandOptions = {
  readonly collect?: readonly CommandCollectRequest[];
  readonly collectOn?: CommandCollectOn;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly idempotencyKey?: string;
  readonly onStderr?: (chunk: string) => void;
  readonly onStdout?: (chunk: string) => void;
  readonly onStreamError?: (error: unknown) => void;
  readonly timeoutMs?: number;
};

type ApiRequestInit = {
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  readonly idempotent?: boolean;
  readonly method: "DELETE" | "GET" | "POST" | "PUT";
};

type ApiStreamInit = {
  readonly body?: unknown;
  readonly idempotencyKey?: string;
  readonly idempotent?: boolean;
  readonly method?: "GET" | "POST";
};

type RawRequestInit = {
  readonly apiError?: boolean;
  readonly auth?: boolean | "same-origin";
  readonly body?: BodyInit;
  readonly headers?: HeadersInit;
  readonly idempotencyKey?: string;
  readonly idempotent?: boolean;
  readonly method: "GET" | "POST" | "PUT";
};

export function createTransport(options: CrowNestClientOptions): Transport {
  const baseUrl = (options.baseUrl ?? "https://api.crownest.dev").replace(/\/$/, "");
  const fetchImpl = options.fetch ?? ((input, init) => fetch(input, init));
  const credential = options.credential ?? options.apiKey ?? readEnvCredential();

  if (credential === undefined || credential.length === 0) {
    throw new Error(
      "CrowNest bearer credential missing. Pass { credential } to createCrowNestClient or set CROWNEST_BEARER_TOKEN. CROWNEST_API_KEY remains supported for developer API keys.",
    );
  }

  return {
    async download(url) {
      const headers = new Headers();
      headers.set("accept", "application/octet-stream");

      headers.set("authorization", `Bearer ${credential}`);

      const response = await fetchImpl(resolveUrl(baseUrl, url), {
        headers,
        method: "GET",
      });

      if (!response.ok) {
        throw await parseErrorResponse(response);
      }

      return new Uint8Array(await response.arrayBuffer());
    },
    async raw(url, init) {
      const headers = new Headers(init.headers);
      const resolvedUrl = resolveUrl(baseUrl, url);

      if (shouldAuthenticateRawRequest(baseUrl, resolvedUrl, init.auth)) {
        headers.set("authorization", `Bearer ${credential}`);
      }

      if (init.idempotencyKey !== undefined) {
        headers.set("idempotency-key", init.idempotencyKey);
      } else if (init.idempotent) {
        headers.set("idempotency-key", createIdempotencyKey());
      }

      const requestInit: RequestInit & { readonly duplex?: "half" } = {
        ...(init.body === undefined ? {} : { body: init.body }),
        ...(isReadableStreamBody(init.body) ? { duplex: "half" } : {}),
        headers,
        method: init.method,
      };
      const response = await fetchImpl(resolvedUrl, requestInit);

      if (!response.ok) {
        if (init.apiError === false) {
          throw new Error(`Request failed with status ${response.status}.`);
        }
        throw await parseErrorResponse(response);
      }

      return response;
    },
    async request<T>(path: string, init: ApiRequestInit) {
      const headers = new Headers();
      headers.set("accept", "application/json");

      headers.set("authorization", `Bearer ${credential}`);

      if (init.body !== undefined) {
        headers.set("content-type", "application/json");
      }

      if (init.idempotencyKey !== undefined) {
        headers.set("idempotency-key", init.idempotencyKey);
      } else if (init.idempotent) {
        headers.set("idempotency-key", createIdempotencyKey());
      }

      const response = await fetchImpl(`${baseUrl}${path}`, {
        headers,
        method: init.method,
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      });
      if (!response.ok) {
        throw await parseErrorResponse(response);
      }

      return (await response.json()) as T;
    },
    async *streamSse<T>(path: string, init: ApiStreamInit = {}) {
      const abortController = new AbortController();
      const headers = new Headers();
      headers.set("accept", "text/event-stream");

      headers.set("authorization", `Bearer ${credential}`);

      if (init.body !== undefined) {
        headers.set("content-type", "application/json");
      }

      if (init.idempotencyKey !== undefined) {
        headers.set("idempotency-key", init.idempotencyKey);
      } else if (init.idempotent) {
        headers.set("idempotency-key", createIdempotencyKey());
      }

      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
        headers,
        method: init.method ?? "GET",
        signal: abortController.signal,
      });

      try {
        if (!response.ok) {
          throw await parseErrorResponse(response);
        }

        if (!response.body) {
          return;
        }

        yield* parseSseStream<T>(response.body);
      } finally {
        abortController.abort();
      }
    },
  };
}

function readEnvCredential(): string | undefined {
  // The SDK must keep working in non-Node runtimes (Workers, browsers),
  // where the process global does not exist.
  const nodeProcess = (
    globalThis as {
      readonly process?: { readonly env?: Record<string, string | undefined> };
    }
  ).process;

  return nodeProcess?.env?.CROWNEST_BEARER_TOKEN ?? nodeProcess?.env?.CROWNEST_API_KEY;
}

async function parseErrorResponse(response: Response): Promise<CrowNestApiError> {
  try {
    const payload = (await response.json()) as ApiErrorResponse;
    return new CrowNestApiError(response.status, payload.error);
  } catch {
    return new CrowNestApiError(response.status, {
      code: "invalid_error_response",
      message: `Request failed with status ${response.status} and a non-JSON response body.`,
    });
  }
}

function resolveUrl(baseUrl: string, value: string): string {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }

  if (value.startsWith("/")) {
    return `${baseUrl}${value}`;
  }

  return `${baseUrl}/${value}`;
}

function isReadableStreamBody(body: BodyInit | undefined): boolean {
  return typeof ReadableStream !== "undefined" && body instanceof ReadableStream;
}

function shouldAuthenticateRawRequest(
  baseUrl: string,
  targetUrl: string,
  auth: RawRequestInit["auth"],
): boolean {
  if (auth === false) return false;
  if (auth !== "same-origin") return true;
  return new URL(baseUrl).origin === new URL(targetUrl).origin;
}

export async function cancelCommand(
  transport: Transport,
  commandId: `cmd_${string}`,
  input: { readonly mode?: "force" | "graceful" },
): Promise<Command> {
  const response = await transport.request<CancelCommandResponse>(
    `/v1/commands/${commandId}/cancel`,
    {
      body: input,
      method: "POST",
    },
  );

  return response.command;
}

export function queryString(params: URLSearchParams): string {
  const value = params.toString();
  return value.length === 0 ? "" : `?${value}`;
}

export function commandLogParams(input: {
  readonly afterSeq?: number;
  readonly limit?: number;
  readonly reconnect?: boolean;
}): URLSearchParams {
  const params = new URLSearchParams();
  if (input.afterSeq !== undefined) {
    params.set("afterSeq", String(input.afterSeq));
  }
  if (input.limit !== undefined) {
    params.set("limit", String(input.limit));
  }

  return params;
}

export async function runSandboxCommand(
  transport: Transport,
  sandboxId: `sbx_${string}`,
  command: string,
  mode: "run" | "start",
  options: RunCommandOptions = {},
): Promise<Command> {
  const {
    idempotencyKey,
    onStderr: _onStderr,
    onStdout: _onStdout,
    onStreamError: _onStreamError,
    ...body
  } = options;
  const response = await transport.request<RunCommandResponse>(
    `/v1/sandboxes/${sandboxId}/commands/${mode}`,
    {
      body: { command, ...body },
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      idempotent: true,
      method: "POST",
    },
  );

  return response.command;
}

export function hasCommandLogCallbacks(options: RunCommandOptions): boolean {
  return (
    options.onStderr !== undefined ||
    options.onStdout !== undefined ||
    options.onStreamError !== undefined
  );
}

export function dispatchCommandLogEvent(
  event: CommandLogStreamEvent,
  options: Pick<RunCommandOptions, "onStderr" | "onStdout" | "onStreamError">,
): boolean {
  if (event.type === "log") {
    const callback = event.stream === "stderr" ? options.onStderr : options.onStdout;
    try {
      callback?.(event.data);
    } catch (error) {
      notifyCommandStreamError(error, options);
      return true;
    }
    return false;
  }

  if (event.type === "error") {
    notifyCommandStreamError(new Error(`${event.code}: ${event.message}`), options);
    return true;
  }

  return event.type === "terminal";
}

export function notifyCommandStreamError(
  error: unknown,
  options: Pick<RunCommandOptions, "onStreamError">,
): void {
  try {
    options.onStreamError?.(error);
  } catch {
    // User callback failures must not become unhandled background rejections.
  }
}

async function* parseSseStream<T>(body: ReadableStream<Uint8Array>): AsyncIterable<T> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        completed = true;
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const payload = parseSsePayload(part);
        if (payload !== undefined) {
          yield payload as T;
        }
      }
    }

    buffer += decoder.decode();
    const payload = parseSsePayload(buffer);
    if (payload !== undefined) {
      yield payload as T;
    }
    completed = true;
  } finally {
    if (!completed) {
      await reader.cancel().catch(() => undefined);
    }
    reader.releaseLock();
  }
}

function parseSsePayload(event: string): unknown {
  const data = event
    .split("\n")
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");

  if (data.length === 0) {
    return undefined;
  }

  return JSON.parse(data) as unknown;
}

function createIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `idem_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/* eslint-enable max-lines-per-function -- End transport construction helpers. */
