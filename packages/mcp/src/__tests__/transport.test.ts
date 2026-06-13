import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

import { OmittedArgumentsTransport } from "../transport";

describe("OmittedArgumentsTransport", () => {
  it("adds empty arguments for zero-argument-capable tools", () => {
    const createSandbox = receiveThroughWrapper(toolCall("create_sandbox"));
    const listFiles = receiveThroughWrapper(toolCall("list_files"));

    expect(getArguments(createSandbox)).toEqual({});
    expect(getArguments(listFiles)).toEqual({});
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
