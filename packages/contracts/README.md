# @crownest/contracts

Public TypeScript API contracts for CrowNest cloud sandboxes.

Most users should install `@crownest/sdk` instead. This package is a low-level
contract package shared by CrowNest clients for public request, response,
resource, error, scope, and resource ID types.

The published package exposes the installable client/API contract surface only.
Dashboard identity helpers, admin reaper contracts, billing webhook records,
and provider export records stay private to the service repository.

```bash
pnpm add @crownest/contracts
```

```ts
import type { Sandbox } from "@crownest/contracts";

function sandboxLabel(sandbox: Sandbox) {
  return `${sandbox.id} ${sandbox.status}`;
}
```

CrowNest uses Sandboxes for isolated execution, Commands for process
invocations, Workspace files for live working state, Artifacts for durable
outputs, and Previews for authenticated HTTP services.

The hosted CrowNest service and runtime implementation are not part of this
package.

Docs: https://crownest.dev/docs

License: Apache-2.0
