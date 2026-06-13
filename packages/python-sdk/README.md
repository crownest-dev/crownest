# CrowNest Python SDK

Python client for CrowNest cloud sandboxes.

```bash
pip install crownest
export CROWNEST_API_KEY="cn_live_..."
```

```python
from crownest import CrowNest

with CrowNest() as client:
    sandbox = client.sandboxes.create(template="python", ttl_ms=60 * 60_000)
    sandbox.files.write(
        "/workspace/main.py",
        "from pathlib import Path\nPath('/workspace/output.txt').write_text('hello')\n",
    )
    command = sandbox.commands.run(
        "python /workspace/main.py",
        collect=[{"path": "/workspace/output.txt", "name": "output.txt"}],
        collect_on="success",
    )
    print(command["status"], command.get("exitCode"))
    print(sandbox.files.read("/workspace/output.txt"))
```

Async usage is available through `AsyncCrowNest`:

```python
from crownest import AsyncCrowNest

async with AsyncCrowNest() as client:
    projects = await client.projects.list()
```

The SDK reads `CROWNEST_API_KEY` by default, accepts `base_url` for local
development, accepts `timeout` for SDK-owned HTTP clients, auto-generates
`Idempotency-Key` for idempotent operations, and raises `CrowNestApiError` with
`status`, `code`, and `details` for API errors.

CrowNest uses Sandboxes for isolated execution, Commands for process
invocations, Workspace files for live working state, Artifacts for durable
outputs, and Previews for authenticated HTTP services.

The hosted CrowNest service and runtime implementation are not part of this
package.

Docs: https://crownest.dev/docs

License: Apache-2.0
