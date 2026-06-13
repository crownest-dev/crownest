# @crownest/cli

Command-line interface for CrowNest cloud sandboxes.

```bash
npm install -g @crownest/cli
export CROWNEST_API_KEY="cn_live_..."
```

```bash
crownest sandboxes create --template python
crownest commands run sbx_... "python -c 'print(40 + 2)'"
crownest files write sbx_... notes.txt "hello from crownest"
crownest artifacts create sbx_... notes.txt
crownest sandboxes kill sbx_...
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

Docs: https://crownest.dev/docs

License: Apache-2.0
