from __future__ import annotations

import asyncio
import base64
import threading
import time
from collections.abc import AsyncIterator, Iterator, Mapping, Sequence
from typing import Any, Callable
from urllib.parse import urlencode

import httpx

from crownest._errors import CrowNestApiError
from crownest._transport import (
    DEFAULT_TIMEOUT_SECONDS,
    AsyncTransport,
    SyncTransport,
    TimeoutConfig,
)
from crownest._types import (
    CodeArtifactPolicy,
    CodeLanguage,
    CommandCancelMode,
    CommandCollectOn,
    CommandCollectRequest,
    FileEncoding,
    Json,
    JsonObject,
    Metadata,
    PreviewAuthMode,
)


class CrowNest:
    """Synchronous CrowNest client."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = "https://api.crownest.dev",
        http_client: httpx.Client | None = None,
        timeout: TimeoutConfig = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._transport = SyncTransport(
            api_key=api_key,
            base_url=base_url,
            http_client=http_client,
            timeout=timeout,
        )
        self.artifacts = ArtifactsClient(self._transport)
        self.code = CodeClient(self._transport)
        self.commands = CommandsClient(self._transport)
        self.files = FilesClient(self._transport)
        self.previews = PreviewsClient(self._transport)
        self.projects = ProjectsClient(self._transport)
        self.sandboxes = SandboxesClient(self._transport)

    def usage(self) -> JsonObject:
        return self._transport.request("/v1/usage", method="GET")

    def close(self) -> None:
        self._transport.close()

    def __enter__(self) -> "CrowNest":
        return self

    def __exit__(self, *_exc: object) -> None:
        self.close()


class AsyncCrowNest:
    """Asynchronous CrowNest client."""

    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = "https://api.crownest.dev",
        http_client: httpx.AsyncClient | None = None,
        timeout: TimeoutConfig = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._transport = AsyncTransport(
            api_key=api_key,
            base_url=base_url,
            http_client=http_client,
            timeout=timeout,
        )
        self.artifacts = AsyncArtifactsClient(self._transport)
        self.code = AsyncCodeClient(self._transport)
        self.commands = AsyncCommandsClient(self._transport)
        self.files = AsyncFilesClient(self._transport)
        self.previews = AsyncPreviewsClient(self._transport)
        self.projects = AsyncProjectsClient(self._transport)
        self.sandboxes = AsyncSandboxesClient(self._transport)

    async def usage(self) -> JsonObject:
        return await self._transport.request("/v1/usage", method="GET")

    async def aclose(self) -> None:
        await self._transport.aclose()

    async def __aenter__(self) -> "AsyncCrowNest":
        return self

    async def __aexit__(self, *_exc: object) -> None:
        await self.aclose()


class SandboxHandle(Mapping[str, Json]):
    def __init__(self, data: Mapping[str, Json], transport: SyncTransport) -> None:
        self._data = dict(data)
        sandbox_id = str(self._data["id"])
        self.artifacts = SandboxArtifactsClient(sandbox_id, transport)
        self.code = SandboxCodeClient(sandbox_id, transport)
        self.commands = SandboxCommandsClient(sandbox_id, transport)
        self.files = SandboxFilesClient(sandbox_id, transport)
        self.previews = SandboxPreviewsClient(sandbox_id, transport)
        self._transport = transport

    @property
    def id(self) -> str:
        return str(self._data["id"])

    def kill(self) -> "SandboxHandle":
        response = self._transport.request(
            f"/v1/sandboxes/{self.id}",
            method="DELETE",
        )
        return SandboxHandle(response["sandbox"], self._transport)

    def extend(
        self,
        *,
        ttl_ms: int,
        idempotency_key: str | None = None,
    ) -> "SandboxHandle":
        response = self._transport.request(
            f"/v1/sandboxes/{self.id}/extend",
            method="POST",
            body={"ttlMs": ttl_ms},
            idempotency_key=idempotency_key,
            idempotent=True,
        )
        return SandboxHandle(response["sandbox"], self._transport)

    def to_dict(self) -> JsonObject:
        return dict(self._data)

    def __getitem__(self, key: str) -> Json:
        return self._data[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self._data)

    def __len__(self) -> int:
        return len(self._data)

    def __getattr__(self, key: str) -> Json:
        try:
            return self._data[key]
        except KeyError as exc:
            raise AttributeError(key) from exc


class AsyncSandboxHandle(Mapping[str, Json]):
    def __init__(self, data: Mapping[str, Json], transport: AsyncTransport) -> None:
        self._data = dict(data)
        sandbox_id = str(self._data["id"])
        self.artifacts = AsyncSandboxArtifactsClient(sandbox_id, transport)
        self.code = AsyncSandboxCodeClient(sandbox_id, transport)
        self.commands = AsyncSandboxCommandsClient(sandbox_id, transport)
        self.files = AsyncSandboxFilesClient(sandbox_id, transport)
        self.previews = AsyncSandboxPreviewsClient(sandbox_id, transport)
        self._transport = transport

    @property
    def id(self) -> str:
        return str(self._data["id"])

    async def kill(self) -> "AsyncSandboxHandle":
        response = await self._transport.request(
            f"/v1/sandboxes/{self.id}",
            method="DELETE",
        )
        return AsyncSandboxHandle(response["sandbox"], self._transport)

    async def extend(
        self,
        *,
        ttl_ms: int,
        idempotency_key: str | None = None,
    ) -> "AsyncSandboxHandle":
        response = await self._transport.request(
            f"/v1/sandboxes/{self.id}/extend",
            method="POST",
            body={"ttlMs": ttl_ms},
            idempotency_key=idempotency_key,
            idempotent=True,
        )
        return AsyncSandboxHandle(response["sandbox"], self._transport)

    def to_dict(self) -> JsonObject:
        return dict(self._data)

    def __getitem__(self, key: str) -> Json:
        return self._data[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self._data)

    def __len__(self) -> int:
        return len(self._data)

    def __getattr__(self, key: str) -> Json:
        try:
            return self._data[key]
        except KeyError as exc:
            raise AttributeError(key) from exc


class CodeClient:
    def __init__(self, transport: SyncTransport) -> None:
        self._transport = transport

    def create_context(
        self,
        sandbox_id: str,
        *,
        cwd: str | None = None,
        idempotency_key: str | None = None,
        language: CodeLanguage = "python",
        timeout_ms: int | None = None,
    ) -> JsonObject:
        return _create_code_context(
            self._transport,
            sandbox_id,
            cwd=cwd,
            idempotency_key=idempotency_key,
            language=language,
            timeout_ms=timeout_ms,
        )

    def delete_context(self, sandbox_id: str, context_id: str) -> JsonObject:
        return _delete_code_context(self._transport, sandbox_id, context_id)

    def run(
        self,
        sandbox_id: str,
        code: str,
        *,
        artifact_policy: CodeArtifactPolicy | None = None,
        context_id: str | None = None,
        cwd: str | None = None,
        idempotency_key: str | None = None,
        language: CodeLanguage = "python",
        timeout_ms: int | None = None,
    ) -> JsonObject:
        return _run_code(
            self._transport,
            sandbox_id,
            code,
            artifact_policy=artifact_policy,
            context_id=context_id,
            cwd=cwd,
            idempotency_key=idempotency_key,
            language=language,
            timeout_ms=timeout_ms,
        )

    def run_stream(
        self,
        sandbox_id: str,
        code: str,
        *,
        artifact_policy: CodeArtifactPolicy | None = None,
        context_id: str | None = None,
        cwd: str | None = None,
        idempotency_key: str | None = None,
        language: CodeLanguage = "python",
        timeout_ms: int | None = None,
    ) -> Iterator[JsonObject]:
        yield from _run_code_stream(
            self._transport,
            sandbox_id,
            code,
            artifact_policy=artifact_policy,
            context_id=context_id,
            cwd=cwd,
            idempotency_key=idempotency_key,
            language=language,
            timeout_ms=timeout_ms,
        )


class AsyncCodeClient:
    def __init__(self, transport: AsyncTransport) -> None:
        self._transport = transport

    async def create_context(
        self,
        sandbox_id: str,
        *,
        cwd: str | None = None,
        idempotency_key: str | None = None,
        language: CodeLanguage = "python",
        timeout_ms: int | None = None,
    ) -> JsonObject:
        return await _async_create_code_context(
            self._transport,
            sandbox_id,
            cwd=cwd,
            idempotency_key=idempotency_key,
            language=language,
            timeout_ms=timeout_ms,
        )

    async def delete_context(self, sandbox_id: str, context_id: str) -> JsonObject:
        return await _async_delete_code_context(self._transport, sandbox_id, context_id)

    async def run(
        self,
        sandbox_id: str,
        code: str,
        *,
        artifact_policy: CodeArtifactPolicy | None = None,
        context_id: str | None = None,
        cwd: str | None = None,
        idempotency_key: str | None = None,
        language: CodeLanguage = "python",
        timeout_ms: int | None = None,
    ) -> JsonObject:
        return await _async_run_code(
            self._transport,
            sandbox_id,
            code,
            artifact_policy=artifact_policy,
            context_id=context_id,
            cwd=cwd,
            idempotency_key=idempotency_key,
            language=language,
            timeout_ms=timeout_ms,
        )

    async def run_stream(
        self,
        sandbox_id: str,
        code: str,
        *,
        artifact_policy: CodeArtifactPolicy | None = None,
        context_id: str | None = None,
        cwd: str | None = None,
        idempotency_key: str | None = None,
        language: CodeLanguage = "python",
        timeout_ms: int | None = None,
    ) -> AsyncIterator[JsonObject]:
        async for event in _async_run_code_stream(
            self._transport,
            sandbox_id,
            code,
            artifact_policy=artifact_policy,
            context_id=context_id,
            cwd=cwd,
            idempotency_key=idempotency_key,
            language=language,
            timeout_ms=timeout_ms,
        ):
            yield event


class SandboxesClient:
    def __init__(self, transport: SyncTransport) -> None:
        self._transport = transport

    def create(
        self,
        *,
        idempotency_key: str | None = None,
        metadata: Metadata | None = None,
        project_id: str | None = None,
        restore_from: str | None = None,
        template: str | None = None,
        template_version_id: str | None = None,
        ttl_ms: int | None = None,
    ) -> SandboxHandle:
        response = self._transport.request(
            "/v1/sandboxes",
            method="POST",
            body=_create_sandbox_body(
                metadata=metadata,
                project_id=project_id,
                restore_from=restore_from,
                template=template,
                template_version_id=template_version_id,
                ttl_ms=ttl_ms,
            ),
            idempotency_key=idempotency_key,
            idempotent=True,
        )
        return SandboxHandle(response["sandbox"], self._transport)

    def get(self, sandbox_id: str) -> SandboxHandle:
        response = self._transport.request(f"/v1/sandboxes/{sandbox_id}", method="GET")
        return SandboxHandle(response["sandbox"], self._transport)

    def extend(
        self,
        sandbox_id: str,
        *,
        ttl_ms: int,
        idempotency_key: str | None = None,
    ) -> SandboxHandle:
        response = self._transport.request(
            f"/v1/sandboxes/{sandbox_id}/extend",
            method="POST",
            body={"ttlMs": ttl_ms},
            idempotency_key=idempotency_key,
            idempotent=True,
        )
        return SandboxHandle(response["sandbox"], self._transport)

    def kill(self, sandbox_id: str) -> JsonObject:
        response = self._transport.request(
            f"/v1/sandboxes/{sandbox_id}",
            method="DELETE",
        )
        return response["sandbox"]

    def list(self, *, metadata: Metadata | None = None) -> list[JsonObject]:
        response = self._transport.request(
            f"/v1/sandboxes{_sandbox_list_query(metadata)}",
            method="GET",
        )
        return list(response["data"])


class AsyncSandboxesClient:
    def __init__(self, transport: AsyncTransport) -> None:
        self._transport = transport

    async def create(
        self,
        *,
        idempotency_key: str | None = None,
        metadata: Metadata | None = None,
        project_id: str | None = None,
        restore_from: str | None = None,
        template: str | None = None,
        template_version_id: str | None = None,
        ttl_ms: int | None = None,
    ) -> AsyncSandboxHandle:
        response = await self._transport.request(
            "/v1/sandboxes",
            method="POST",
            body=_create_sandbox_body(
                metadata=metadata,
                project_id=project_id,
                restore_from=restore_from,
                template=template,
                template_version_id=template_version_id,
                ttl_ms=ttl_ms,
            ),
            idempotency_key=idempotency_key,
            idempotent=True,
        )
        return AsyncSandboxHandle(response["sandbox"], self._transport)

    async def get(self, sandbox_id: str) -> AsyncSandboxHandle:
        response = await self._transport.request(
            f"/v1/sandboxes/{sandbox_id}",
            method="GET",
        )
        return AsyncSandboxHandle(response["sandbox"], self._transport)

    async def extend(
        self,
        sandbox_id: str,
        *,
        ttl_ms: int,
        idempotency_key: str | None = None,
    ) -> AsyncSandboxHandle:
        response = await self._transport.request(
            f"/v1/sandboxes/{sandbox_id}/extend",
            method="POST",
            body={"ttlMs": ttl_ms},
            idempotency_key=idempotency_key,
            idempotent=True,
        )
        return AsyncSandboxHandle(response["sandbox"], self._transport)

    async def kill(self, sandbox_id: str) -> JsonObject:
        response = await self._transport.request(
            f"/v1/sandboxes/{sandbox_id}",
            method="DELETE",
        )
        return response["sandbox"]

    async def list(self, *, metadata: Metadata | None = None) -> list[JsonObject]:
        response = await self._transport.request(
            f"/v1/sandboxes{_sandbox_list_query(metadata)}",
            method="GET",
        )
        return list(response["data"])


class CommandsClient:
    def __init__(self, transport: SyncTransport) -> None:
        self._transport = transport

    def get(self, command_id: str) -> JsonObject:
        response = self._transport.request(f"/v1/commands/{command_id}", method="GET")
        return response["command"]

    def cancel(
        self,
        command_id: str,
        *,
        mode: CommandCancelMode | None = None,
    ) -> JsonObject:
        return _cancel_command(self._transport, command_id, mode=mode)

    def logs(
        self,
        command_id: str,
        *,
        after_seq: int | None = None,
        limit: int | None = None,
    ) -> list[JsonObject]:
        response = self._transport.request(
            f"/v1/commands/{command_id}/logs{_command_log_query(after_seq, limit)}",
            method="GET",
        )
        return list(response["data"])

    def run(
        self,
        sandbox_id: str,
        command: str,
        **options: Any,
    ) -> JsonObject:
        return _run_command(self._transport, sandbox_id, command, "run", **options)

    def start(
        self,
        sandbox_id: str,
        command: str,
        **options: Any,
    ) -> JsonObject:
        return _run_command(self._transport, sandbox_id, command, "start", **options)

    def stream_logs(
        self,
        command_id: str,
        *,
        after_seq: int | None = None,
        reconnect: bool = True,
    ) -> Iterator[JsonObject]:
        yield from _stream_logs(
            self._transport,
            command_id,
            after_seq=after_seq,
            reconnect=reconnect,
        )


class AsyncCommandsClient:
    def __init__(self, transport: AsyncTransport) -> None:
        self._transport = transport

    async def get(self, command_id: str) -> JsonObject:
        response = await self._transport.request(
            f"/v1/commands/{command_id}",
            method="GET",
        )
        return response["command"]

    async def cancel(
        self,
        command_id: str,
        *,
        mode: CommandCancelMode | None = None,
    ) -> JsonObject:
        return await _async_cancel_command(self._transport, command_id, mode=mode)

    async def logs(
        self,
        command_id: str,
        *,
        after_seq: int | None = None,
        limit: int | None = None,
    ) -> list[JsonObject]:
        response = await self._transport.request(
            f"/v1/commands/{command_id}/logs{_command_log_query(after_seq, limit)}",
            method="GET",
        )
        return list(response["data"])

    async def run(
        self,
        sandbox_id: str,
        command: str,
        **options: Any,
    ) -> JsonObject:
        return await _async_run_command(
            self._transport,
            sandbox_id,
            command,
            "run",
            **options,
        )

    async def start(
        self,
        sandbox_id: str,
        command: str,
        **options: Any,
    ) -> JsonObject:
        return await _async_run_command(
            self._transport,
            sandbox_id,
            command,
            "start",
            **options,
        )

    async def stream_logs(
        self,
        command_id: str,
        *,
        after_seq: int | None = None,
        reconnect: bool = True,
    ) -> AsyncIterator[JsonObject]:
        async for event in _async_stream_logs(
            self._transport,
            command_id,
            after_seq=after_seq,
            reconnect=reconnect,
        ):
            yield event


class FilesClient:
    def __init__(self, transport: SyncTransport) -> None:
        self._transport = transport

    def delete(self, sandbox_id: str, path: str) -> None:
        _delete_file(self._transport, sandbox_id, path)

    def download_url(self, sandbox_id: str, path: str) -> JsonObject:
        return _file_download_url(self._transport, sandbox_id, path)

    def list(self, sandbox_id: str, path: str = "/workspace") -> list[JsonObject]:
        return _list_files(self._transport, sandbox_id, path)

    def mkdir(
        self,
        sandbox_id: str,
        path: str,
        *,
        parents: bool | None = None,
    ) -> JsonObject:
        return _mkdir(self._transport, sandbox_id, path, parents=parents)

    def move(
        self,
        sandbox_id: str,
        from_path: str,
        to_path: str,
        *,
        overwrite: bool | None = None,
    ) -> JsonObject:
        return _move_file(
            self._transport,
            sandbox_id,
            from_path,
            to_path,
            overwrite=overwrite,
        )

    def read(
        self,
        sandbox_id: str,
        path: str,
        *,
        encoding: FileEncoding | None = None,
    ) -> str:
        return _read_file(self._transport, sandbox_id, path, encoding=encoding)

    def read_bytes(self, sandbox_id: str, path: str) -> bytes:
        """Read a small file as bytes via the API's direct base64 file limit."""
        return _read_file_bytes(self._transport, sandbox_id, path)

    def stat(self, sandbox_id: str, path: str) -> JsonObject:
        return _stat_file(self._transport, sandbox_id, path)

    def write(
        self,
        sandbox_id: str,
        path: str,
        content: str,
        *,
        create_parents: bool | None = None,
        encoding: FileEncoding | None = None,
        overwrite: bool | None = None,
    ) -> JsonObject:
        return _write_file(
            self._transport,
            sandbox_id,
            path,
            content,
            create_parents=create_parents,
            encoding=encoding,
            overwrite=overwrite,
        )

    def write_bytes(
        self,
        sandbox_id: str,
        path: str,
        content: bytes,
        *,
        create_parents: bool | None = None,
        overwrite: bool | None = None,
    ) -> JsonObject:
        """Write a small file as bytes via the API's direct base64 file limit."""
        return _write_file_bytes(
            self._transport,
            sandbox_id,
            path,
            content,
            create_parents=create_parents,
            overwrite=overwrite,
        )


class AsyncFilesClient:
    def __init__(self, transport: AsyncTransport) -> None:
        self._transport = transport

    async def delete(self, sandbox_id: str, path: str) -> None:
        await _async_delete_file(self._transport, sandbox_id, path)

    async def download_url(self, sandbox_id: str, path: str) -> JsonObject:
        return await _async_file_download_url(self._transport, sandbox_id, path)

    async def list(
        self,
        sandbox_id: str,
        path: str = "/workspace",
    ) -> list[JsonObject]:
        return await _async_list_files(self._transport, sandbox_id, path)

    async def mkdir(
        self,
        sandbox_id: str,
        path: str,
        *,
        parents: bool | None = None,
    ) -> JsonObject:
        return await _async_mkdir(self._transport, sandbox_id, path, parents=parents)

    async def move(
        self,
        sandbox_id: str,
        from_path: str,
        to_path: str,
        *,
        overwrite: bool | None = None,
    ) -> JsonObject:
        return await _async_move_file(
            self._transport,
            sandbox_id,
            from_path,
            to_path,
            overwrite=overwrite,
        )

    async def read(
        self,
        sandbox_id: str,
        path: str,
        *,
        encoding: FileEncoding | None = None,
    ) -> str:
        return await _async_read_file(self._transport, sandbox_id, path, encoding=encoding)

    async def read_bytes(self, sandbox_id: str, path: str) -> bytes:
        """Read a small file as bytes via the API's direct base64 file limit."""
        return await _async_read_file_bytes(self._transport, sandbox_id, path)

    async def stat(self, sandbox_id: str, path: str) -> JsonObject:
        return await _async_stat_file(self._transport, sandbox_id, path)

    async def write(
        self,
        sandbox_id: str,
        path: str,
        content: str,
        *,
        create_parents: bool | None = None,
        encoding: FileEncoding | None = None,
        overwrite: bool | None = None,
    ) -> JsonObject:
        return await _async_write_file(
            self._transport,
            sandbox_id,
            path,
            content,
            create_parents=create_parents,
            encoding=encoding,
            overwrite=overwrite,
        )

    async def write_bytes(
        self,
        sandbox_id: str,
        path: str,
        content: bytes,
        *,
        create_parents: bool | None = None,
        overwrite: bool | None = None,
    ) -> JsonObject:
        """Write a small file as bytes via the API's direct base64 file limit."""
        return await _async_write_file_bytes(
            self._transport,
            sandbox_id,
            path,
            content,
            create_parents=create_parents,
            overwrite=overwrite,
        )


class SandboxFilesClient:
    def __init__(self, sandbox_id: str, transport: SyncTransport) -> None:
        self._sandbox_id = sandbox_id
        self._transport = transport

    def delete(self, path: str) -> None:
        _delete_file(self._transport, self._sandbox_id, path)

    def download_url(self, path: str) -> JsonObject:
        return _file_download_url(self._transport, self._sandbox_id, path)

    def list(self, path: str = "/workspace") -> list[JsonObject]:
        return _list_files(self._transport, self._sandbox_id, path)

    def mkdir(self, path: str, *, parents: bool | None = None) -> JsonObject:
        return _mkdir(self._transport, self._sandbox_id, path, parents=parents)

    def move(
        self,
        from_path: str,
        to_path: str,
        *,
        overwrite: bool | None = None,
    ) -> JsonObject:
        return _move_file(
            self._transport,
            self._sandbox_id,
            from_path,
            to_path,
            overwrite=overwrite,
        )

    def read(self, path: str, *, encoding: FileEncoding | None = None) -> str:
        return _read_file(self._transport, self._sandbox_id, path, encoding=encoding)

    def read_bytes(self, path: str) -> bytes:
        """Read a small file as bytes via the API's direct base64 file limit."""
        return _read_file_bytes(self._transport, self._sandbox_id, path)

    def stat(self, path: str) -> JsonObject:
        return _stat_file(self._transport, self._sandbox_id, path)

    def write(
        self,
        path: str,
        content: str,
        *,
        create_parents: bool | None = None,
        encoding: FileEncoding | None = None,
        overwrite: bool | None = None,
    ) -> JsonObject:
        return _write_file(
            self._transport,
            self._sandbox_id,
            path,
            content,
            create_parents=create_parents,
            encoding=encoding,
            overwrite=overwrite,
        )

    def write_bytes(
        self,
        path: str,
        content: bytes,
        *,
        create_parents: bool | None = None,
        overwrite: bool | None = None,
    ) -> JsonObject:
        """Write a small file as bytes via the API's direct base64 file limit."""
        return _write_file_bytes(
            self._transport,
            self._sandbox_id,
            path,
            content,
            create_parents=create_parents,
            overwrite=overwrite,
        )


class AsyncSandboxFilesClient:
    def __init__(self, sandbox_id: str, transport: AsyncTransport) -> None:
        self._sandbox_id = sandbox_id
        self._transport = transport

    async def delete(self, path: str) -> None:
        await _async_delete_file(self._transport, self._sandbox_id, path)

    async def download_url(self, path: str) -> JsonObject:
        return await _async_file_download_url(self._transport, self._sandbox_id, path)

    async def list(self, path: str = "/workspace") -> list[JsonObject]:
        return await _async_list_files(self._transport, self._sandbox_id, path)

    async def mkdir(self, path: str, *, parents: bool | None = None) -> JsonObject:
        return await _async_mkdir(
            self._transport,
            self._sandbox_id,
            path,
            parents=parents,
        )

    async def move(
        self,
        from_path: str,
        to_path: str,
        *,
        overwrite: bool | None = None,
    ) -> JsonObject:
        return await _async_move_file(
            self._transport,
            self._sandbox_id,
            from_path,
            to_path,
            overwrite=overwrite,
        )

    async def read(self, path: str, *, encoding: FileEncoding | None = None) -> str:
        return await _async_read_file(
            self._transport,
            self._sandbox_id,
            path,
            encoding=encoding,
        )

    async def read_bytes(self, path: str) -> bytes:
        """Read a small file as bytes via the API's direct base64 file limit."""
        return await _async_read_file_bytes(self._transport, self._sandbox_id, path)

    async def stat(self, path: str) -> JsonObject:
        return await _async_stat_file(self._transport, self._sandbox_id, path)

    async def write(
        self,
        path: str,
        content: str,
        *,
        create_parents: bool | None = None,
        encoding: FileEncoding | None = None,
        overwrite: bool | None = None,
    ) -> JsonObject:
        return await _async_write_file(
            self._transport,
            self._sandbox_id,
            path,
            content,
            create_parents=create_parents,
            encoding=encoding,
            overwrite=overwrite,
        )

    async def write_bytes(
        self,
        path: str,
        content: bytes,
        *,
        create_parents: bool | None = None,
        overwrite: bool | None = None,
    ) -> JsonObject:
        """Write a small file as bytes via the API's direct base64 file limit."""
        return await _async_write_file_bytes(
            self._transport,
            self._sandbox_id,
            path,
            content,
            create_parents=create_parents,
            overwrite=overwrite,
        )


class ArtifactsClient:
    def __init__(self, transport: SyncTransport) -> None:
        self._transport = transport

    def create(
        self,
        sandbox_id: str,
        *,
        path: str,
        idempotency_key: str | None = None,
        name: str | None = None,
    ) -> JsonObject:
        return _create_artifact(
            self._transport,
            sandbox_id,
            path=path,
            idempotency_key=idempotency_key,
            name=name,
        )

    def delete(self, artifact_id: str) -> JsonObject:
        response = self._transport.request(
            f"/v1/artifacts/{artifact_id}",
            method="DELETE",
        )
        return response["artifact"]

    def download(self, artifact_id: str) -> bytes:
        return self._transport.download(f"/v1/artifacts/{artifact_id}/download")

    def download_url(self, artifact_id: str) -> JsonObject:
        return self._transport.request(
            f"/v1/artifacts/{artifact_id}/download-url",
            method="POST",
        )

    def get(self, artifact_id: str) -> JsonObject:
        response = self._transport.request(
            f"/v1/artifacts/{artifact_id}",
            method="GET",
        )
        return response["artifact"]

    def list(self, sandbox_id: str) -> list[JsonObject]:
        return _list_artifacts(self._transport, sandbox_id)


class AsyncArtifactsClient:
    def __init__(self, transport: AsyncTransport) -> None:
        self._transport = transport

    async def create(
        self,
        sandbox_id: str,
        *,
        path: str,
        idempotency_key: str | None = None,
        name: str | None = None,
    ) -> JsonObject:
        return await _async_create_artifact(
            self._transport,
            sandbox_id,
            path=path,
            idempotency_key=idempotency_key,
            name=name,
        )

    async def delete(self, artifact_id: str) -> JsonObject:
        response = await self._transport.request(
            f"/v1/artifacts/{artifact_id}",
            method="DELETE",
        )
        return response["artifact"]

    async def download(self, artifact_id: str) -> bytes:
        return await self._transport.download(f"/v1/artifacts/{artifact_id}/download")

    async def download_url(self, artifact_id: str) -> JsonObject:
        return await self._transport.request(
            f"/v1/artifacts/{artifact_id}/download-url",
            method="POST",
        )

    async def get(self, artifact_id: str) -> JsonObject:
        response = await self._transport.request(
            f"/v1/artifacts/{artifact_id}",
            method="GET",
        )
        return response["artifact"]

    async def list(self, sandbox_id: str) -> list[JsonObject]:
        return await _async_list_artifacts(self._transport, sandbox_id)


class SandboxArtifactsClient:
    def __init__(self, sandbox_id: str, transport: SyncTransport) -> None:
        self._sandbox_id = sandbox_id
        self._transport = transport

    def create(
        self,
        *,
        path: str,
        idempotency_key: str | None = None,
        name: str | None = None,
    ) -> JsonObject:
        return _create_artifact(
            self._transport,
            self._sandbox_id,
            path=path,
            idempotency_key=idempotency_key,
            name=name,
        )

    def list(self) -> list[JsonObject]:
        return _list_artifacts(self._transport, self._sandbox_id)


class AsyncSandboxArtifactsClient:
    def __init__(self, sandbox_id: str, transport: AsyncTransport) -> None:
        self._sandbox_id = sandbox_id
        self._transport = transport

    async def create(
        self,
        *,
        path: str,
        idempotency_key: str | None = None,
        name: str | None = None,
    ) -> JsonObject:
        return await _async_create_artifact(
            self._transport,
            self._sandbox_id,
            path=path,
            idempotency_key=idempotency_key,
            name=name,
        )

    async def list(self) -> list[JsonObject]:
        return await _async_list_artifacts(self._transport, self._sandbox_id)


class PreviewsClient:
    def __init__(self, transport: SyncTransport) -> None:
        self._transport = transport

    def create(
        self,
        sandbox_id: str,
        *,
        port: int,
        auth_mode: PreviewAuthMode | None = None,
    ) -> JsonObject:
        return _create_preview(self._transport, sandbox_id, port, auth_mode=auth_mode)

    def get(self, preview_id: str) -> JsonObject:
        response = self._transport.request(f"/v1/previews/{preview_id}", method="GET")
        return response["preview"]

    def list(self, sandbox_id: str) -> list[JsonObject]:
        return _list_previews(self._transport, sandbox_id)

    def revoke(self, preview_id: str) -> JsonObject:
        response = self._transport.request(
            f"/v1/previews/{preview_id}",
            method="DELETE",
        )
        return response["preview"]


class AsyncPreviewsClient:
    def __init__(self, transport: AsyncTransport) -> None:
        self._transport = transport

    async def create(
        self,
        sandbox_id: str,
        *,
        port: int,
        auth_mode: PreviewAuthMode | None = None,
    ) -> JsonObject:
        return await _async_create_preview(
            self._transport,
            sandbox_id,
            port,
            auth_mode=auth_mode,
        )

    async def get(self, preview_id: str) -> JsonObject:
        response = await self._transport.request(
            f"/v1/previews/{preview_id}",
            method="GET",
        )
        return response["preview"]

    async def list(self, sandbox_id: str) -> list[JsonObject]:
        return await _async_list_previews(self._transport, sandbox_id)

    async def revoke(self, preview_id: str) -> JsonObject:
        response = await self._transport.request(
            f"/v1/previews/{preview_id}",
            method="DELETE",
        )
        return response["preview"]


class SandboxPreviewsClient:
    def __init__(self, sandbox_id: str, transport: SyncTransport) -> None:
        self._sandbox_id = sandbox_id
        self._transport = transport

    def create(
        self,
        *,
        port: int,
        auth_mode: PreviewAuthMode | None = None,
    ) -> JsonObject:
        return _create_preview(
            self._transport,
            self._sandbox_id,
            port,
            auth_mode=auth_mode,
        )

    def list(self) -> list[JsonObject]:
        return _list_previews(self._transport, self._sandbox_id)


class AsyncSandboxPreviewsClient:
    def __init__(self, sandbox_id: str, transport: AsyncTransport) -> None:
        self._sandbox_id = sandbox_id
        self._transport = transport

    async def create(
        self,
        *,
        port: int,
        auth_mode: PreviewAuthMode | None = None,
    ) -> JsonObject:
        return await _async_create_preview(
            self._transport,
            self._sandbox_id,
            port,
            auth_mode=auth_mode,
        )

    async def list(self) -> list[JsonObject]:
        return await _async_list_previews(self._transport, self._sandbox_id)


class ProjectsClient:
    def __init__(self, transport: SyncTransport) -> None:
        self._transport = transport

    def list(self) -> list[JsonObject]:
        response = self._transport.request("/v1/projects", method="GET")
        return list(response["data"])


class AsyncProjectsClient:
    def __init__(self, transport: AsyncTransport) -> None:
        self._transport = transport

    async def list(self) -> list[JsonObject]:
        response = await self._transport.request("/v1/projects", method="GET")
        return list(response["data"])


class SandboxCommandsClient:
    def __init__(self, sandbox_id: str, transport: SyncTransport) -> None:
        self._sandbox_id = sandbox_id
        self._transport = transport

    def cancel(
        self,
        command_id: str,
        *,
        mode: CommandCancelMode | None = None,
    ) -> JsonObject:
        return _cancel_command(
            self._transport,
            command_id,
            mode=mode,
            path=f"/v1/sandboxes/{self._sandbox_id}/commands/{command_id}/cancel",
        )

    def run(self, command: str, **options: Any) -> JsonObject:
        return _run_command(self._transport, self._sandbox_id, command, "run", **options)

    def start(self, command: str, **options: Any) -> JsonObject:
        return _run_command(
            self._transport,
            self._sandbox_id,
            command,
            "start",
            **options,
        )


class AsyncSandboxCommandsClient:
    def __init__(self, sandbox_id: str, transport: AsyncTransport) -> None:
        self._sandbox_id = sandbox_id
        self._transport = transport

    async def cancel(
        self,
        command_id: str,
        *,
        mode: CommandCancelMode | None = None,
    ) -> JsonObject:
        return await _async_cancel_command(
            self._transport,
            command_id,
            mode=mode,
            path=f"/v1/sandboxes/{self._sandbox_id}/commands/{command_id}/cancel",
        )

    async def run(self, command: str, **options: Any) -> JsonObject:
        return await _async_run_command(
            self._transport,
            self._sandbox_id,
            command,
            "run",
            **options,
        )

    async def start(self, command: str, **options: Any) -> JsonObject:
        return await _async_run_command(
            self._transport,
            self._sandbox_id,
            command,
            "start",
            **options,
        )


class SandboxCodeClient:
    def __init__(self, sandbox_id: str, transport: SyncTransport) -> None:
        self._sandbox_id = sandbox_id
        self._transport = transport

    def create_context(
        self,
        *,
        cwd: str | None = None,
        idempotency_key: str | None = None,
        language: CodeLanguage = "python",
        timeout_ms: int | None = None,
    ) -> JsonObject:
        return _create_code_context(
            self._transport,
            self._sandbox_id,
            cwd=cwd,
            idempotency_key=idempotency_key,
            language=language,
            timeout_ms=timeout_ms,
        )

    def delete_context(self, context_id: str) -> JsonObject:
        return _delete_code_context(self._transport, self._sandbox_id, context_id)

    def run(
        self,
        code: str,
        *,
        artifact_policy: CodeArtifactPolicy | None = None,
        context_id: str | None = None,
        cwd: str | None = None,
        idempotency_key: str | None = None,
        language: CodeLanguage = "python",
        timeout_ms: int | None = None,
    ) -> JsonObject:
        return _run_code(
            self._transport,
            self._sandbox_id,
            code,
            artifact_policy=artifact_policy,
            context_id=context_id,
            cwd=cwd,
            idempotency_key=idempotency_key,
            language=language,
            timeout_ms=timeout_ms,
        )

    def run_stream(
        self,
        code: str,
        *,
        artifact_policy: CodeArtifactPolicy | None = None,
        context_id: str | None = None,
        cwd: str | None = None,
        idempotency_key: str | None = None,
        language: CodeLanguage = "python",
        timeout_ms: int | None = None,
    ) -> Iterator[JsonObject]:
        yield from _run_code_stream(
            self._transport,
            self._sandbox_id,
            code,
            artifact_policy=artifact_policy,
            context_id=context_id,
            cwd=cwd,
            idempotency_key=idempotency_key,
            language=language,
            timeout_ms=timeout_ms,
        )


class AsyncSandboxCodeClient:
    def __init__(self, sandbox_id: str, transport: AsyncTransport) -> None:
        self._sandbox_id = sandbox_id
        self._transport = transport

    async def create_context(
        self,
        *,
        cwd: str | None = None,
        idempotency_key: str | None = None,
        language: CodeLanguage = "python",
        timeout_ms: int | None = None,
    ) -> JsonObject:
        return await _async_create_code_context(
            self._transport,
            self._sandbox_id,
            cwd=cwd,
            idempotency_key=idempotency_key,
            language=language,
            timeout_ms=timeout_ms,
        )

    async def delete_context(self, context_id: str) -> JsonObject:
        return await _async_delete_code_context(
            self._transport,
            self._sandbox_id,
            context_id,
        )

    async def run(
        self,
        code: str,
        *,
        artifact_policy: CodeArtifactPolicy | None = None,
        context_id: str | None = None,
        cwd: str | None = None,
        idempotency_key: str | None = None,
        language: CodeLanguage = "python",
        timeout_ms: int | None = None,
    ) -> JsonObject:
        return await _async_run_code(
            self._transport,
            self._sandbox_id,
            code,
            artifact_policy=artifact_policy,
            context_id=context_id,
            cwd=cwd,
            idempotency_key=idempotency_key,
            language=language,
            timeout_ms=timeout_ms,
        )

    async def run_stream(
        self,
        code: str,
        *,
        artifact_policy: CodeArtifactPolicy | None = None,
        context_id: str | None = None,
        cwd: str | None = None,
        idempotency_key: str | None = None,
        language: CodeLanguage = "python",
        timeout_ms: int | None = None,
    ) -> AsyncIterator[JsonObject]:
        async for event in _async_run_code_stream(
            self._transport,
            self._sandbox_id,
            code,
            artifact_policy=artifact_policy,
            context_id=context_id,
            cwd=cwd,
            idempotency_key=idempotency_key,
            language=language,
            timeout_ms=timeout_ms,
        ):
            yield event


def _run_command(
    transport: SyncTransport,
    sandbox_id: str,
    command: str,
    mode: str,
    *,
    collect: Sequence[CommandCollectRequest] | None = None,
    collect_on: CommandCollectOn | None = None,
    cwd: str | None = None,
    env: Mapping[str, str] | None = None,
    idempotency_key: str | None = None,
    on_stderr: Callable[[str], None] | None = None,
    on_stdout: Callable[[str], None] | None = None,
    on_stream_error: Callable[[BaseException], None] | None = None,
    require_command_read: bool | None = None,
    timeout_ms: int | None = None,
) -> JsonObject:
    if on_stderr or on_stdout or on_stream_error:
        callbacks = _CommandCallbacks(
            on_stderr=on_stderr,
            on_stdout=on_stdout,
            on_stream_error=on_stream_error,
        )
        if mode == "run" and (collect is not None or collect_on is not None):
            terminal_command = _run_command(
                transport,
                sandbox_id,
                command,
                "run",
                collect=collect,
                collect_on=collect_on,
                cwd=cwd,
                env=env,
                idempotency_key=idempotency_key,
                require_command_read=_callback_run_requires_command_read(mode),
                timeout_ms=timeout_ms,
            )
            _replay_command_logs(transport, str(terminal_command["id"]), callbacks)
            return terminal_command

        command_response = _run_command(
            transport,
            sandbox_id,
            command,
            "start",
            cwd=cwd,
            env=env,
            idempotency_key=idempotency_key,
            on_stderr=None,
            on_stdout=None,
            on_stream_error=None,
            require_command_read=_callback_run_requires_command_read(mode),
            timeout_ms=_callback_run_timeout_ms(mode, timeout_ms),
        )
        if mode == "start":
            _start_pump_thread(transport, str(command_response["id"]), callbacks)
            return command_response
        return _consume_stream_until_terminal_or_poll(
            transport,
            str(command_response["id"]),
            callbacks,
        )

    path, body = _run_command_request(
        sandbox_id,
        command,
        mode,
        collect=collect,
        collect_on=collect_on,
        cwd=cwd,
        env=env,
        require_command_read=require_command_read,
        timeout_ms=timeout_ms,
    )
    response = transport.request(
        path,
        method="POST",
        body=body,
        idempotency_key=idempotency_key,
        idempotent=True,
    )
    return response["command"]


async def _async_run_command(
    transport: AsyncTransport,
    sandbox_id: str,
    command: str,
    mode: str,
    *,
    collect: Sequence[CommandCollectRequest] | None = None,
    collect_on: CommandCollectOn | None = None,
    cwd: str | None = None,
    env: Mapping[str, str] | None = None,
    idempotency_key: str | None = None,
    on_stderr: Callable[[str], None] | None = None,
    on_stdout: Callable[[str], None] | None = None,
    on_stream_error: Callable[[BaseException], None] | None = None,
    require_command_read: bool | None = None,
    timeout_ms: int | None = None,
) -> JsonObject:
    if on_stderr or on_stdout or on_stream_error:
        callbacks = _CommandCallbacks(
            on_stderr=on_stderr,
            on_stdout=on_stdout,
            on_stream_error=on_stream_error,
        )
        if mode == "run" and (collect is not None or collect_on is not None):
            terminal_command = await _async_run_command(
                transport,
                sandbox_id,
                command,
                "run",
                collect=collect,
                collect_on=collect_on,
                cwd=cwd,
                env=env,
                idempotency_key=idempotency_key,
                require_command_read=_callback_run_requires_command_read(mode),
                timeout_ms=timeout_ms,
            )
            await _async_replay_command_logs(
                transport,
                str(terminal_command["id"]),
                callbacks,
            )
            return terminal_command

        command_response = await _async_run_command(
            transport,
            sandbox_id,
            command,
            "start",
            cwd=cwd,
            env=env,
            idempotency_key=idempotency_key,
            on_stderr=None,
            on_stdout=None,
            on_stream_error=None,
            require_command_read=_callback_run_requires_command_read(mode),
            timeout_ms=_callback_run_timeout_ms(mode, timeout_ms),
        )
        if mode == "start":
            _start_async_pump_task(transport, str(command_response["id"]), callbacks)
            return command_response
        return await _async_consume_stream_until_terminal_or_poll(
            transport,
            str(command_response["id"]),
            callbacks,
        )

    path, body = _run_command_request(
        sandbox_id,
        command,
        mode,
        collect=collect,
        collect_on=collect_on,
        cwd=cwd,
        env=env,
        require_command_read=require_command_read,
        timeout_ms=timeout_ms,
    )
    response = await transport.request(
        path,
        method="POST",
        body=body,
        idempotency_key=idempotency_key,
        idempotent=True,
    )
    return response["command"]


def _callback_run_timeout_ms(mode: str, timeout_ms: int | None) -> int | None:
    if mode == "run" and timeout_ms is None:
        return _DEFAULT_BLOCKING_COMMAND_TIMEOUT_MS
    return timeout_ms


def _callback_run_requires_command_read(mode: str) -> bool | None:
    return True if mode == "run" else None


def _cancel_command(
    transport: SyncTransport,
    command_id: str,
    *,
    mode: CommandCancelMode | None = None,
    path: str | None = None,
) -> JsonObject:
    response = transport.request(
        path or f"/v1/commands/{command_id}/cancel",
        method="POST",
        body=_compact({"mode": mode}),
    )
    return response["command"]


async def _async_cancel_command(
    transport: AsyncTransport,
    command_id: str,
    *,
    mode: CommandCancelMode | None = None,
    path: str | None = None,
) -> JsonObject:
    response = await transport.request(
        path or f"/v1/commands/{command_id}/cancel",
        method="POST",
        body=_compact({"mode": mode}),
    )
    return response["command"]


def _command_log_query(after_seq: int | None, limit: int | None) -> str:
    params = _compact({"afterSeq": after_seq, "limit": limit})
    return f"?{urlencode(params)}" if params else ""


class _CommandCallbacks:
    def __init__(
        self,
        *,
        on_stderr: Callable[[str], None] | None,
        on_stdout: Callable[[str], None] | None,
        on_stream_error: Callable[[BaseException], None] | None,
    ) -> None:
        self.on_stderr = on_stderr
        self.on_stdout = on_stdout
        self.on_stream_error = on_stream_error


_STREAM_RECONNECT_DELAYS = (0.25, 0.5, 1.0, 2.0, 4.0)
_TERMINAL_COMMAND_STATUSES = {"exited", "failed", "canceled", "timed_out", "killed"}
_DEFAULT_BLOCKING_COMMAND_TIMEOUT_MS = 60_000


def _stream_logs(
    transport: SyncTransport,
    command_id: str,
    *,
    after_seq: int | None = None,
    reconnect: bool = True,
) -> Iterator[JsonObject]:
    if not reconnect:
        yield from transport.stream_sse(
            f"/v1/commands/{command_id}/stream{_command_log_query(after_seq, None)}"
        )
        return

    retry_index = 0
    original_error: BaseException | None = None
    while True:
        made_log_progress = False
        try:
            for event in transport.stream_sse(
                f"/v1/commands/{command_id}/stream{_command_log_query(after_seq, None)}"
            ):
                if isinstance(event, Mapping) and event.get("type") == "log":
                    made_log_progress = (
                        after_seq is None or int(event["seq"]) > after_seq
                    )
                    after_seq = int(event["seq"])
                yield event
                if _is_terminal_stream_event(event):
                    return
            original_error = original_error or RuntimeError(
                "Command log stream ended before a terminal event."
            )
        except Exception as exc:
            if isinstance(exc, CrowNestApiError):
                raise
            original_error = original_error or exc
        if made_log_progress:
            retry_index = 0
        if retry_index >= len(_STREAM_RECONNECT_DELAYS):
            raise original_error
        time.sleep(_STREAM_RECONNECT_DELAYS[retry_index])
        retry_index += 1


async def _async_stream_logs(
    transport: AsyncTransport,
    command_id: str,
    *,
    after_seq: int | None = None,
    reconnect: bool = True,
) -> AsyncIterator[JsonObject]:
    if not reconnect:
        async for event in transport.stream_sse(
            f"/v1/commands/{command_id}/stream{_command_log_query(after_seq, None)}"
        ):
            yield event
        return

    retry_index = 0
    original_error: BaseException | None = None
    while True:
        made_log_progress = False
        try:
            async for event in transport.stream_sse(
                f"/v1/commands/{command_id}/stream{_command_log_query(after_seq, None)}"
            ):
                if isinstance(event, Mapping) and event.get("type") == "log":
                    made_log_progress = (
                        after_seq is None or int(event["seq"]) > after_seq
                    )
                    after_seq = int(event["seq"])
                yield event
                if _is_terminal_stream_event(event):
                    return
            original_error = original_error or RuntimeError(
                "Command log stream ended before a terminal event."
            )
        except Exception as exc:
            if isinstance(exc, CrowNestApiError):
                raise
            original_error = original_error or exc
        if made_log_progress:
            retry_index = 0
        if retry_index >= len(_STREAM_RECONNECT_DELAYS):
            raise original_error
        await asyncio.sleep(_STREAM_RECONNECT_DELAYS[retry_index])
        retry_index += 1


def _is_terminal_stream_event(event: object) -> bool:
    return isinstance(event, Mapping) and event.get("type") in {"terminal", "error"}


def _start_pump_thread(
    transport: SyncTransport,
    command_id: str,
    callbacks: _CommandCallbacks,
) -> threading.Thread:
    thread = threading.Thread(
        target=_pump_command_stream,
        args=(transport, command_id, callbacks),
        daemon=True,
    )
    thread.start()
    return thread


def _start_async_pump_task(
    transport: AsyncTransport,
    command_id: str,
    callbacks: _CommandCallbacks,
) -> None:
    task = asyncio.create_task(
        _async_pump_command_stream(
            transport,
            command_id,
            callbacks,
        )
    )
    task.add_done_callback(_discard_async_task_result)


def _discard_async_task_result(task: asyncio.Task[None]) -> None:
    try:
        task.result()
    except BaseException:
        pass


def _pump_command_stream(
    transport: SyncTransport,
    command_id: str,
    callbacks: _CommandCallbacks,
) -> None:
    try:
        for event in _stream_logs(transport, command_id):
            if _dispatch_stream_event(event, callbacks):
                return
    except Exception as exc:
        _notify_stream_error(callbacks, exc)


async def _async_pump_command_stream(
    transport: AsyncTransport,
    command_id: str,
    callbacks: _CommandCallbacks,
) -> None:
    try:
        async for event in _async_stream_logs(transport, command_id):
            if _dispatch_stream_event(event, callbacks):
                return
    except Exception as exc:
        _notify_stream_error(callbacks, exc)


def _consume_stream_until_terminal_or_poll(
    transport: SyncTransport,
    command_id: str,
    callbacks: _CommandCallbacks,
) -> JsonObject:
    try:
        for event in _stream_logs(transport, command_id):
            if event.get("type") == "terminal":
                command = event.get("command")
                if isinstance(command, Mapping):
                    return dict(command)
                return _poll_command_until_terminal(transport, command_id)
            if _dispatch_stream_event(event, callbacks):
                break
    except Exception as exc:
        _notify_stream_error(callbacks, exc)
    return _poll_command_until_terminal(transport, command_id)


async def _async_consume_stream_until_terminal_or_poll(
    transport: AsyncTransport,
    command_id: str,
    callbacks: _CommandCallbacks,
) -> JsonObject:
    try:
        async for event in _async_stream_logs(transport, command_id):
            if event.get("type") == "terminal":
                command = event.get("command")
                if isinstance(command, Mapping):
                    return dict(command)
                return await _async_poll_command_until_terminal(transport, command_id)
            if _dispatch_stream_event(event, callbacks):
                break
    except Exception as exc:
        _notify_stream_error(callbacks, exc)
    return await _async_poll_command_until_terminal(transport, command_id)


def _replay_command_logs(
    transport: SyncTransport,
    command_id: str,
    callbacks: _CommandCallbacks,
) -> None:
    after_seq: int | None = None
    try:
        while True:
            response = transport.request(
                f"/v1/commands/{command_id}/logs{_command_log_query(after_seq, None)}",
                method="GET",
            )
            data = list(response["data"])
            for chunk in data:
                if _dispatch_stream_event({**chunk, "type": "log"}, callbacks):
                    return
                after_seq = int(chunk["seq"])
            if not response.get("hasMore") or not data:
                return
    except Exception as exc:
        _notify_stream_error(callbacks, exc)


async def _async_replay_command_logs(
    transport: AsyncTransport,
    command_id: str,
    callbacks: _CommandCallbacks,
) -> None:
    after_seq: int | None = None
    try:
        while True:
            response = await transport.request(
                f"/v1/commands/{command_id}/logs{_command_log_query(after_seq, None)}",
                method="GET",
            )
            data = list(response["data"])
            for chunk in data:
                if _dispatch_stream_event({**chunk, "type": "log"}, callbacks):
                    return
                after_seq = int(chunk["seq"])
            if not response.get("hasMore") or not data:
                return
    except Exception as exc:
        _notify_stream_error(callbacks, exc)


def _dispatch_stream_event(event: JsonObject, callbacks: _CommandCallbacks) -> bool:
    event_type = event.get("type")
    if event_type == "log":
        stream = event.get("stream")
        data = str(event.get("data", ""))
        try:
            if stream == "stderr" and callbacks.on_stderr:
                callbacks.on_stderr(data)
            if stream == "stdout" and callbacks.on_stdout:
                callbacks.on_stdout(data)
        except Exception as exc:
            _notify_stream_error(callbacks, exc)
            return True
        return False
    if event_type == "error":
        _notify_stream_error(
            callbacks,
            RuntimeError(f"{event.get('code')}: {event.get('message')}"),
        )
        return True
    return event_type == "terminal"


def _notify_stream_error(callbacks: _CommandCallbacks, exc: BaseException) -> None:
    if not callbacks.on_stream_error:
        return
    try:
        callbacks.on_stream_error(exc)
    except Exception:
        pass


def _poll_command_until_terminal(
    transport: SyncTransport,
    command_id: str,
) -> JsonObject:
    while True:
        response = transport.request(f"/v1/commands/{command_id}", method="GET")
        command = response["command"]
        if command.get("status") in _TERMINAL_COMMAND_STATUSES:
            return command
        time.sleep(0.5)


async def _async_poll_command_until_terminal(
    transport: AsyncTransport,
    command_id: str,
) -> JsonObject:
    while True:
        response = await transport.request(f"/v1/commands/{command_id}", method="GET")
        command = response["command"]
        if command.get("status") in _TERMINAL_COMMAND_STATUSES:
            return command
        await asyncio.sleep(0.5)


def _create_sandbox_body(
    *,
    metadata: Metadata | None = None,
    project_id: str | None = None,
    restore_from: str | None = None,
    template: str | None = None,
    template_version_id: str | None = None,
    ttl_ms: int | None = None,
) -> JsonObject:
    return _compact(
        {
            "metadata": metadata,
            "projectId": project_id,
            "restoreFrom": restore_from,
            "template": template,
            "templateVersionId": template_version_id,
            "ttlMs": ttl_ms,
        }
    )


def _sandbox_list_query(metadata: Metadata | None) -> str:
    if not metadata:
        return ""
    return f"?{urlencode({f'metadata.{key}': value for key, value in metadata.items()})}"


def _run_command_request(
    sandbox_id: str,
    command: str,
    mode: str,
    *,
    collect: Sequence[CommandCollectRequest] | None = None,
    collect_on: CommandCollectOn | None = None,
    cwd: str | None = None,
    env: Mapping[str, str] | None = None,
    require_command_read: bool | None = None,
    timeout_ms: int | None = None,
) -> tuple[str, JsonObject]:
    return (
        f"/v1/sandboxes/{sandbox_id}/commands/{mode}",
        _compact(
            {
                "collect": collect,
                "collectOn": collect_on,
                "command": command,
                "cwd": cwd,
                "env": env,
                "_crownestRequireCommandRead": require_command_read,
                "timeoutMs": timeout_ms,
            }
        ),
    )


def _create_code_context(
    transport: SyncTransport,
    sandbox_id: str,
    *,
    cwd: str | None = None,
    idempotency_key: str | None = None,
    language: CodeLanguage = "python",
    timeout_ms: int | None = None,
) -> JsonObject:
    response = transport.request(
        f"/v1/sandboxes/{sandbox_id}/code/contexts",
        method="POST",
        body=_code_context_body(cwd=cwd, language=language, timeout_ms=timeout_ms),
        idempotency_key=idempotency_key,
        idempotent=True,
    )
    return response["context"]


async def _async_create_code_context(
    transport: AsyncTransport,
    sandbox_id: str,
    *,
    cwd: str | None = None,
    idempotency_key: str | None = None,
    language: CodeLanguage = "python",
    timeout_ms: int | None = None,
) -> JsonObject:
    response = await transport.request(
        f"/v1/sandboxes/{sandbox_id}/code/contexts",
        method="POST",
        body=_code_context_body(cwd=cwd, language=language, timeout_ms=timeout_ms),
        idempotency_key=idempotency_key,
        idempotent=True,
    )
    return response["context"]


def _delete_code_context(
    transport: SyncTransport,
    sandbox_id: str,
    context_id: str,
) -> JsonObject:
    response = transport.request(
        f"/v1/sandboxes/{sandbox_id}/code/contexts/{context_id}",
        method="DELETE",
    )
    return response["context"]


async def _async_delete_code_context(
    transport: AsyncTransport,
    sandbox_id: str,
    context_id: str,
) -> JsonObject:
    response = await transport.request(
        f"/v1/sandboxes/{sandbox_id}/code/contexts/{context_id}",
        method="DELETE",
    )
    return response["context"]


def _run_code(
    transport: SyncTransport,
    sandbox_id: str,
    code: str,
    *,
    artifact_policy: CodeArtifactPolicy | None = None,
    context_id: str | None = None,
    cwd: str | None = None,
    idempotency_key: str | None = None,
    language: CodeLanguage = "python",
    timeout_ms: int | None = None,
) -> JsonObject:
    response = transport.request(
        f"/v1/sandboxes/{sandbox_id}/code/runs",
        method="POST",
        body=_run_code_body(
            code,
            artifact_policy=artifact_policy,
            context_id=context_id,
            cwd=cwd,
            language=language,
            timeout_ms=timeout_ms,
        ),
        idempotency_key=idempotency_key,
        idempotent=True,
    )
    return response["run"]


async def _async_run_code(
    transport: AsyncTransport,
    sandbox_id: str,
    code: str,
    *,
    artifact_policy: CodeArtifactPolicy | None = None,
    context_id: str | None = None,
    cwd: str | None = None,
    idempotency_key: str | None = None,
    language: CodeLanguage = "python",
    timeout_ms: int | None = None,
) -> JsonObject:
    response = await transport.request(
        f"/v1/sandboxes/{sandbox_id}/code/runs",
        method="POST",
        body=_run_code_body(
            code,
            artifact_policy=artifact_policy,
            context_id=context_id,
            cwd=cwd,
            language=language,
            timeout_ms=timeout_ms,
        ),
        idempotency_key=idempotency_key,
        idempotent=True,
    )
    return response["run"]


def _run_code_stream(
    transport: SyncTransport,
    sandbox_id: str,
    code: str,
    *,
    artifact_policy: CodeArtifactPolicy | None = None,
    context_id: str | None = None,
    cwd: str | None = None,
    idempotency_key: str | None = None,
    language: CodeLanguage = "python",
    timeout_ms: int | None = None,
) -> Iterator[JsonObject]:
    yield from transport.stream_sse(
        f"/v1/sandboxes/{sandbox_id}/code/runs/stream",
        method="POST",
        body=_run_code_body(
            code,
            artifact_policy=artifact_policy,
            context_id=context_id,
            cwd=cwd,
            language=language,
            timeout_ms=timeout_ms,
        ),
        idempotency_key=idempotency_key,
        idempotent=True,
    )


async def _async_run_code_stream(
    transport: AsyncTransport,
    sandbox_id: str,
    code: str,
    *,
    artifact_policy: CodeArtifactPolicy | None = None,
    context_id: str | None = None,
    cwd: str | None = None,
    idempotency_key: str | None = None,
    language: CodeLanguage = "python",
    timeout_ms: int | None = None,
) -> AsyncIterator[JsonObject]:
    async for event in transport.stream_sse(
        f"/v1/sandboxes/{sandbox_id}/code/runs/stream",
        method="POST",
        body=_run_code_body(
            code,
            artifact_policy=artifact_policy,
            context_id=context_id,
            cwd=cwd,
            language=language,
            timeout_ms=timeout_ms,
        ),
        idempotency_key=idempotency_key,
        idempotent=True,
    ):
        yield event


def _code_context_body(
    *,
    cwd: str | None = None,
    language: CodeLanguage = "python",
    timeout_ms: int | None = None,
) -> JsonObject:
    return _compact({"cwd": cwd, "language": language, "timeoutMs": timeout_ms})


def _run_code_body(
    code: str,
    *,
    artifact_policy: CodeArtifactPolicy | None = None,
    context_id: str | None = None,
    cwd: str | None = None,
    language: CodeLanguage = "python",
    timeout_ms: int | None = None,
) -> JsonObject:
    return _compact(
        {
            "artifactPolicy": artifact_policy,
            "code": code,
            "contextId": context_id,
            "cwd": cwd,
            "language": language,
            "timeoutMs": timeout_ms,
        }
    )


def _delete_file(transport: SyncTransport, sandbox_id: str, path: str) -> None:
    transport.request(_file_path(sandbox_id, "files", {"path": path}), method="DELETE")


async def _async_delete_file(
    transport: AsyncTransport,
    sandbox_id: str,
    path: str,
) -> None:
    await transport.request(_file_path(sandbox_id, "files", {"path": path}), method="DELETE")


def _file_download_url(
    transport: SyncTransport,
    sandbox_id: str,
    path: str,
) -> JsonObject:
    return transport.request(
        f"/v1/sandboxes/{sandbox_id}/files/download-url",
        method="POST",
        body={"path": path},
    )


async def _async_file_download_url(
    transport: AsyncTransport,
    sandbox_id: str,
    path: str,
) -> JsonObject:
    return await transport.request(
        f"/v1/sandboxes/{sandbox_id}/files/download-url",
        method="POST",
        body={"path": path},
    )


def _list_files(
    transport: SyncTransport,
    sandbox_id: str,
    path: str,
) -> list[JsonObject]:
    response = transport.request(
        _file_path(sandbox_id, "files", {"path": path}),
        method="GET",
    )
    return list(response["data"])


async def _async_list_files(
    transport: AsyncTransport,
    sandbox_id: str,
    path: str,
) -> list[JsonObject]:
    response = await transport.request(
        _file_path(sandbox_id, "files", {"path": path}),
        method="GET",
    )
    return list(response["data"])


def _mkdir(
    transport: SyncTransport,
    sandbox_id: str,
    path: str,
    *,
    parents: bool | None = None,
) -> JsonObject:
    response = transport.request(
        f"/v1/sandboxes/{sandbox_id}/files/mkdir",
        method="POST",
        body=_compact({"path": path, "parents": parents}),
    )
    return response["file"]


async def _async_mkdir(
    transport: AsyncTransport,
    sandbox_id: str,
    path: str,
    *,
    parents: bool | None = None,
) -> JsonObject:
    response = await transport.request(
        f"/v1/sandboxes/{sandbox_id}/files/mkdir",
        method="POST",
        body=_compact({"path": path, "parents": parents}),
    )
    return response["file"]


def _move_file(
    transport: SyncTransport,
    sandbox_id: str,
    from_path: str,
    to_path: str,
    *,
    overwrite: bool | None = None,
) -> JsonObject:
    response = transport.request(
        f"/v1/sandboxes/{sandbox_id}/files/move",
        method="POST",
        body=_move_file_body(from_path, to_path, overwrite=overwrite),
    )
    return response["file"]


async def _async_move_file(
    transport: AsyncTransport,
    sandbox_id: str,
    from_path: str,
    to_path: str,
    *,
    overwrite: bool | None = None,
) -> JsonObject:
    response = await transport.request(
        f"/v1/sandboxes/{sandbox_id}/files/move",
        method="POST",
        body=_move_file_body(from_path, to_path, overwrite=overwrite),
    )
    return response["file"]


def _read_file(
    transport: SyncTransport,
    sandbox_id: str,
    path: str,
    *,
    encoding: FileEncoding | None = None,
) -> str:
    response = transport.request(
        _file_path(sandbox_id, "files/read", _compact({"path": path, "encoding": encoding})),
        method="GET",
    )
    return str(response["content"])


def _read_file_bytes(
    transport: SyncTransport,
    sandbox_id: str,
    path: str,
) -> bytes:
    return base64.b64decode(_read_file(transport, sandbox_id, path, encoding="base64"))


async def _async_read_file(
    transport: AsyncTransport,
    sandbox_id: str,
    path: str,
    *,
    encoding: FileEncoding | None = None,
) -> str:
    response = await transport.request(
        _file_path(sandbox_id, "files/read", _compact({"path": path, "encoding": encoding})),
        method="GET",
    )
    return str(response["content"])


async def _async_read_file_bytes(
    transport: AsyncTransport,
    sandbox_id: str,
    path: str,
) -> bytes:
    return base64.b64decode(
        await _async_read_file(transport, sandbox_id, path, encoding="base64")
    )


def _stat_file(transport: SyncTransport, sandbox_id: str, path: str) -> JsonObject:
    response = transport.request(
        _file_path(sandbox_id, "files/stat", {"path": path}),
        method="GET",
    )
    return response["file"]


async def _async_stat_file(
    transport: AsyncTransport,
    sandbox_id: str,
    path: str,
) -> JsonObject:
    response = await transport.request(
        _file_path(sandbox_id, "files/stat", {"path": path}),
        method="GET",
    )
    return response["file"]


def _write_file(
    transport: SyncTransport,
    sandbox_id: str,
    path: str,
    content: str,
    *,
    create_parents: bool | None = None,
    encoding: FileEncoding | None = None,
    overwrite: bool | None = None,
) -> JsonObject:
    response = transport.request(
        f"/v1/sandboxes/{sandbox_id}/files",
        method="PUT",
        body=_write_file_body(
            path,
            content,
            create_parents=create_parents,
            encoding=encoding,
            overwrite=overwrite,
        ),
    )
    return response["file"]


def _write_file_bytes(
    transport: SyncTransport,
    sandbox_id: str,
    path: str,
    content: bytes,
    *,
    create_parents: bool | None = None,
    overwrite: bool | None = None,
) -> JsonObject:
    return _write_file(
        transport,
        sandbox_id,
        path,
        base64.b64encode(content).decode("ascii"),
        create_parents=create_parents,
        encoding="base64",
        overwrite=overwrite,
    )


async def _async_write_file(
    transport: AsyncTransport,
    sandbox_id: str,
    path: str,
    content: str,
    *,
    create_parents: bool | None = None,
    encoding: FileEncoding | None = None,
    overwrite: bool | None = None,
) -> JsonObject:
    response = await transport.request(
        f"/v1/sandboxes/{sandbox_id}/files",
        method="PUT",
        body=_write_file_body(
            path,
            content,
            create_parents=create_parents,
            encoding=encoding,
            overwrite=overwrite,
        ),
    )
    return response["file"]


async def _async_write_file_bytes(
    transport: AsyncTransport,
    sandbox_id: str,
    path: str,
    content: bytes,
    *,
    create_parents: bool | None = None,
    overwrite: bool | None = None,
) -> JsonObject:
    return await _async_write_file(
        transport,
        sandbox_id,
        path,
        base64.b64encode(content).decode("ascii"),
        create_parents=create_parents,
        encoding="base64",
        overwrite=overwrite,
    )


def _create_artifact(
    transport: SyncTransport,
    sandbox_id: str,
    *,
    path: str,
    idempotency_key: str | None = None,
    name: str | None = None,
) -> JsonObject:
    response = transport.request(
        f"/v1/sandboxes/{sandbox_id}/artifacts",
        method="POST",
        body=_compact({"name": name, "path": path}),
        idempotency_key=idempotency_key,
        idempotent=True,
    )
    return response["artifact"]


async def _async_create_artifact(
    transport: AsyncTransport,
    sandbox_id: str,
    *,
    path: str,
    idempotency_key: str | None = None,
    name: str | None = None,
) -> JsonObject:
    response = await transport.request(
        f"/v1/sandboxes/{sandbox_id}/artifacts",
        method="POST",
        body=_compact({"name": name, "path": path}),
        idempotency_key=idempotency_key,
        idempotent=True,
    )
    return response["artifact"]


def _list_artifacts(transport: SyncTransport, sandbox_id: str) -> list[JsonObject]:
    response = transport.request(f"/v1/sandboxes/{sandbox_id}/artifacts", method="GET")
    return list(response["data"])


async def _async_list_artifacts(
    transport: AsyncTransport,
    sandbox_id: str,
) -> list[JsonObject]:
    response = await transport.request(
        f"/v1/sandboxes/{sandbox_id}/artifacts",
        method="GET",
    )
    return list(response["data"])


def _create_preview(
    transport: SyncTransport,
    sandbox_id: str,
    port: int,
    *,
    auth_mode: PreviewAuthMode | None = None,
) -> JsonObject:
    response = transport.request(
        f"/v1/sandboxes/{sandbox_id}/previews",
        method="POST",
        body=_compact({"authMode": auth_mode, "port": port}),
    )
    return response


async def _async_create_preview(
    transport: AsyncTransport,
    sandbox_id: str,
    port: int,
    *,
    auth_mode: PreviewAuthMode | None = None,
) -> JsonObject:
    response = await transport.request(
        f"/v1/sandboxes/{sandbox_id}/previews",
        method="POST",
        body=_compact({"authMode": auth_mode, "port": port}),
    )
    return response


def _list_previews(transport: SyncTransport, sandbox_id: str) -> list[JsonObject]:
    response = transport.request(f"/v1/sandboxes/{sandbox_id}/previews", method="GET")
    return list(response["data"])


async def _async_list_previews(
    transport: AsyncTransport,
    sandbox_id: str,
) -> list[JsonObject]:
    response = await transport.request(
        f"/v1/sandboxes/{sandbox_id}/previews",
        method="GET",
    )
    return list(response["data"])


def _move_file_body(
    from_path: str,
    to_path: str,
    *,
    overwrite: bool | None = None,
) -> JsonObject:
    return _compact({"from": from_path, "to": to_path, "overwrite": overwrite})


def _write_file_body(
    path: str,
    content: str,
    *,
    create_parents: bool | None = None,
    encoding: FileEncoding | None = None,
    overwrite: bool | None = None,
) -> JsonObject:
    return _compact(
        {
            "content": content,
            "createParents": create_parents,
            "encoding": encoding,
            "overwrite": overwrite,
            "path": path,
        }
    )


def _file_path(
    sandbox_id: str,
    action: str,
    params: Mapping[str, Any],
) -> str:
    return f"/v1/sandboxes/{sandbox_id}/{action}?{urlencode(params)}"


def _compact(values: Mapping[str, Any]) -> JsonObject:
    return {key: value for key, value in values.items() if value is not None}
