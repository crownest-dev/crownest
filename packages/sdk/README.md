# @crownest/sdk

TypeScript SDK for CrowNest cloud sandboxes for coding agents.

```bash
pnpm add @crownest/sdk
export CROWNEST_BEARER_TOKEN="cn_agent_or_cn_live_..."
```

```ts
import { createCrowNestClient } from "@crownest/sdk";

const client = createCrowNestClient();

const sandbox = await client.sandboxes.create({ template: "python-node" });

const result = await sandbox.commands.run("python3 -c 'print(40 + 2)'");
console.log(result.exitCode, result.stdout);

await sandbox.files.write("notes.txt", "hello from crownest");
const content = await sandbox.files.read("notes.txt");
console.log(content);

const artifact = await sandbox.artifacts.create({ path: "notes.txt" });
console.log("artifact:", artifact.id);

await sandbox.commands.start("python3 -m http.server 8000");
const { preview } = await sandbox.previews.create({ port: 8000 });
console.log("preview:", preview.url);

await sandbox.kill();
```

CrowNest uses Sandboxes for isolated execution, Commands for process
invocations, Workspace files for live working state, Artifacts for durable
outputs, and Previews for authenticated HTTP services.

The hosted CrowNest service and runtime implementation are not part of this
package.

`CROWNEST_BEARER_TOKEN` may be an auth.md agent access token or a developer
API key. `CROWNEST_API_KEY` and the `{ apiKey }` option remain supported for
developer-key compatibility.

Docs: https://crownest.dev/docs

License: Apache-2.0
