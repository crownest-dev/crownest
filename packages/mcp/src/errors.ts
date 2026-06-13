import { CrowNestApiError } from "@crownest/sdk";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

import { McpSessionError } from "./session";

export function toolError(error: unknown): CallToolResult {
  if (error instanceof CrowNestApiError) {
    return errorResult(error.code, error.message);
  }

  if (error instanceof McpSessionError) {
    return errorResult(error.code, error.message);
  }

  if (error instanceof Error) {
    return errorResult("internal_error", error.message);
  }

  return errorResult("internal_error", String(error));
}

export function errorResult(code: string, message: string): CallToolResult {
  return {
    content: [
      {
        text: `${code}: ${message}`,
        type: "text",
      },
    ],
    isError: true,
  };
}
