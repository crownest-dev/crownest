# @crownest/cli

Command-line interface for CrowNest cloud sandboxes.

```bash
npm install -g @crownest/cli
export CROWNEST_BEARER_TOKEN="cn_agent_or_cn_live_..."
```

```bash
crownest sandboxes create --template python-node
crownest commands run sbx_... -- python3 -c 'print(40 + 2)'
crownest files write sbx_... notes.txt "hello from crownest"
crownest artifacts create sbx_... notes.txt
crownest sandboxes kill sbx_...
```

Install the bundled Agent Skill for compatible coding agents:

```bash
crownest skills install
```

For one-off usage after the package is published:

```bash
npx @crownest/cli sandboxes list
```

CrowNest uses Sandboxes for isolated execution, Commands for process
invocations, Workspace files for live working state, Artifacts for durable
outputs, and Previews for authenticated HTTP services.

The hosted CrowNest service and runtime implementation are not part of this
package.

`CROWNEST_BEARER_TOKEN` may be an auth.md agent access token or a developer
API key. `CROWNEST_API_KEY` remains supported for developer-key
compatibility.

Docs: https://crownest.dev/docs

License: Apache-2.0
