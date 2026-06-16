# @crownest/ai-sdk

Vercel AI SDK tools for CrowNest cloud sandboxes.

This package is verified against `ai@6.x`, whose tool API uses
`tool({ inputSchema, execute })`.

```bash
pnpm add @crownest/ai-sdk ai @ai-sdk/openai
export CROWNEST_API_KEY="cn_live_..."
export OPENAI_API_KEY="sk-..."
```

## generateText

```ts
import { openai } from "@ai-sdk/openai";
import { crownestTools, killSession } from "@crownest/ai-sdk";
import { generateText, stepCountIs } from "ai";

const tools = crownestTools({
  template: "python",
  ttlMs: 15 * 60_000,
});

try {
  const result = await generateText({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
    system:
      "Use CrowNest tools for code execution and Workspace file operations. Keep generated files under /workspace.",
    prompt:
      "Create a small CSV, write it to /workspace/revenue.csv, run Python to summarize total revenue, and report the result.",
    tools,
    stopWhen: stepCountIs(5),
  });

  console.log(result.text);
} finally {
  await killSession(tools);
}
```

## streamText

```ts
import { openai } from "@ai-sdk/openai";
import { crownestTools, killSession } from "@crownest/ai-sdk";
import { stepCountIs, streamText } from "ai";

const tools = crownestTools();

try {
  const result = streamText({
    model: openai(process.env.OPENAI_MODEL ?? "gpt-4o-mini"),
    prompt: "Run Python in CrowNest to print the first five Fibonacci numbers.",
    tools,
    stopWhen: stepCountIs(5),
  });

  for await (const text of result.textStream) {
    process.stdout.write(text);
  }
} finally {
  await killSession(tools);
}
```

## Tools

`crownestTools()` returns four AI SDK tools:

| Tool         | Use                                                                   |
| ------------ | --------------------------------------------------------------------- |
| `runCode`    | Run Python, JavaScript, or TypeScript snippets in a Sandbox.          |
| `runCommand` | Run a shell command in `/workspace` and wait for completion.          |
| `readFile`   | Read a UTF-8 Workspace file, capped at 64 KB by default.              |
| `writeFile`  | Write a UTF-8 Workspace file, creating parent directories by default. |

When `sandboxId` is omitted, the first tool call lazily creates one Sandbox
and later calls reuse it. Pass `sandboxId` to target an existing Sandbox
without creating or killing one:

```ts
const tools = crownestTools({ sandboxId: "sbx_existing" });
```

Call `killSession(tools)` when the request, job, or agent run is complete.
Sandbox TTL auto-expiry is the backstop, not the primary cleanup path.

Tool calls are serialized within one tool set so a model-emitted `writeFile`
can complete before a sibling `runCode` or `readFile` observes the Workspace.

The package reads `CROWNEST_API_KEY` through `@crownest/sdk` by default.
Pass `apiKey` or `baseUrl` to `crownestTools()` for explicit configuration.

Docs: https://crownest.dev/docs

License: Apache-2.0
