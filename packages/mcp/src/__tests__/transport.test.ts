import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

import {
  OmittedArgumentsTransport,
  toolsAcceptingOmittedArguments,
} from "../transport";

const omittedArgumentToolNames = [
  "create_sandbox",
  "list_files",
  "list_sandboxes",
  "get_usage",
  "get_sandbox",
  "list_artifacts",
  "list_previews",
  "list_code_contexts",
  "list_api_keys",
];

describe("OmittedArgumentsTransport", () => {
  it("adds empty arguments for zero-argument-capable tools", () => {
    expect([...toolsAcceptingOmittedArguments]).toEqual(omittedArgumentToolNames);

    for (const toolName of omittedArgumentToolNames) {
      expect(getArguments(receiveThroughWrapper(toolCall(toolName)))).toEqual({});
    }
  });

  it("preserves explicit arguments and tools that require arguments", () => {
    const explicit = receiveThroughWrapper(
      toolCall("list_files", { path: "/workspace" }),
    );
    const required = receiveThroughWrapper(toolCall("run_code"));

    expect(getArguments(explicit)).toEqual({ path: "/workspace" });
    expect(getArguments(required)).toBeUndefined();
  });
});

function receiveThroughWrapper(message: JSONRPCMessage): JSONRPCMessage {
  const inner = createTransport();
  const transport = new OmittedArgumentsTransport(inner);
  let received: JSONRPCMessage | undefined;

  transport.onmessage = (incoming) => {
    received = incoming;
  };
  inner.onmessage?.(message);

  if (received === undefined) {
    throw new Error("Wrapper did not forward the message.");
  }

  return received;
}

function toolCall(name: string, args?: Record<string, unknown>): JSONRPCMessage {
  return {
    id: 1,
    jsonrpc: "2.0",
    method: "tools/call",
    params: {
      ...(args === undefined ? {} : { arguments: args }),
      name,
    },
  };
}

function getArguments(message: JSONRPCMessage): unknown {
  if (!("params" in message) || !isRecord(message.params)) {
    return undefined;
  }

  return message.params.arguments;
}

function createTransport(): Transport {
  return {
    close: vi.fn((): Promise<void> => Promise.resolve()),
    send: vi.fn((): Promise<void> => Promise.resolve()),
    start: vi.fn((): Promise<void> => Promise.resolve()),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
