import type {
  Transport,
  TransportSendOptions,
} from "@modelcontextprotocol/sdk/shared/transport.js";
import type {
  JSONRPCMessage,
  MessageExtraInfo,
} from "@modelcontextprotocol/sdk/types.js";

export const toolsAcceptingOmittedArguments = new Set([
  "create_sandbox",
  "list_files",
  "list_sandboxes",
  "get_usage",
  "get_sandbox",
  "list_artifacts",
  "list_previews",
  "list_code_contexts",
  "list_api_keys",
]);

export class OmittedArgumentsTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: NonNullable<Transport["onmessage"]>;

  constructor(
    private readonly inner: Transport,
    private readonly toolNames: ReadonlySet<string> = toolsAcceptingOmittedArguments,
  ) {
    inner.onclose = () => {
      this.onclose?.();
    };
    inner.onerror = (error) => {
      this.onerror?.(error);
    };
    inner.onmessage = (message, extra?: MessageExtraInfo) => {
      this.onmessage?.(normalizeOmittedArguments(message, this.toolNames), extra);
    };
  }

  setProtocolVersion(version: string): void {
    this.inner.setProtocolVersion?.(version);
  }

  start(): Promise<void> {
    return this.inner.start();
  }

  send(message: JSONRPCMessage, options?: TransportSendOptions): Promise<void> {
    return this.inner.send(message, options);
  }

  close(): Promise<void> {
    return this.inner.close();
  }
}

function normalizeOmittedArguments(
  message: JSONRPCMessage,
  toolNames: ReadonlySet<string>,
): JSONRPCMessage {
  if (!isToolCallWithOmittedArguments(message, toolNames)) {
    return message;
  }

  return {
    ...message,
    params: {
      ...message.params,
      arguments: {},
    },
  };
}

function isToolCallWithOmittedArguments(
  message: unknown,
  toolNames: ReadonlySet<string>,
): message is JSONRPCMessage & {
  readonly method: "tools/call";
  readonly params: { readonly name: string; readonly arguments?: unknown };
} {
  if (!isRecord(message) || message.method !== "tools/call") {
    return false;
  }

  const params = message.params;
  if (!isRecord(params) || params.arguments !== undefined) {
    return false;
  }

  return typeof params.name === "string" && toolNames.has(params.name);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
