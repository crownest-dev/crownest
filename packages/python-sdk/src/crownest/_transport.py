from __future__ import annotations

import json
import os
import uuid
from collections.abc import AsyncIterator, Iterable, Iterator, Mapping
from typing import Any

import httpx

from crownest._errors import CrowNestApiError
from crownest._types import Json

DEFAULT_BASE_URL = "https://api.crownest.dev"
MAX_BLOCKING_COMMAND_TIMEOUT_SECONDS = 10 * 60
DEFAULT_TIMEOUT_SECONDS = MAX_BLOCKING_COMMAND_TIMEOUT_SECONDS + 60
TimeoutConfig = float | httpx.Timeout | None


class SyncTransport:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        http_client: httpx.Client | None = None,
        timeout: TimeoutConfig = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._api_key = _resolve_api_key(api_key)
        self._base_url = base_url.rstrip("/")
        self._owns_client = http_client is None
        self._client = http_client or httpx.Client(timeout=timeout)

    def close(self) -> None:
        if self._owns_client:
            self._client.close()

    def request(
        self,
        path: str,
        *,
        method: str,
        body: Mapping[str, Any] | None = None,
        idempotency_key: str | None = None,
        idempotent: bool = False,
    ) -> Json:
        headers = self._headers(
            accept="application/json",
            has_json_body=body is not None,
            idempotency_key=idempotency_key,
            idempotent=idempotent,
        )
        response = self._client.request(
            method,
            self._url(path),
            headers=headers,
            json=body,
        )
        _raise_for_error(response)
        return response.json()

    def download(self, url: str) -> bytes:
        response = self._client.get(
            self._url(url),
            headers=self._headers(accept="application/octet-stream"),
        )
        _raise_for_error(response)
        return response.content

    def stream_sse(
        self,
        path: str,
        *,
        method: str = "GET",
        body: Mapping[str, Any] | None = None,
        idempotency_key: str | None = None,
        idempotent: bool = False,
    ) -> Iterator[Json]:
        with self._client.stream(
            method,
            self._url(path),
            headers=self._headers(
                accept="text/event-stream",
                has_json_body=body is not None,
                idempotency_key=idempotency_key,
                idempotent=idempotent,
            ),
            json=body,
        ) as response:
            if not response.is_success:
                response.read()
            _raise_for_error(response)
            yield from parse_sse_events(response.iter_text())

    def _headers(
        self,
        *,
        accept: str,
        has_json_body: bool = False,
        idempotency_key: str | None = None,
        idempotent: bool = False,
    ) -> dict[str, str]:
        headers = {
            "accept": accept,
            "authorization": f"Bearer {self._api_key}",
        }
        if has_json_body:
            headers["content-type"] = "application/json"
        if idempotency_key is not None:
            headers["idempotency-key"] = idempotency_key
        elif idempotent:
            headers["idempotency-key"] = _create_idempotency_key()
        return headers

    def _url(self, value: str) -> str:
        return _resolve_url(self._base_url, value)


class AsyncTransport:
    def __init__(
        self,
        *,
        api_key: str | None = None,
        base_url: str = DEFAULT_BASE_URL,
        http_client: httpx.AsyncClient | None = None,
        timeout: TimeoutConfig = DEFAULT_TIMEOUT_SECONDS,
    ) -> None:
        self._api_key = _resolve_api_key(api_key)
        self._base_url = base_url.rstrip("/")
        self._owns_client = http_client is None
        self._client = http_client or httpx.AsyncClient(timeout=timeout)

    async def aclose(self) -> None:
        if self._owns_client:
            await self._client.aclose()

    async def request(
        self,
        path: str,
        *,
        method: str,
        body: Mapping[str, Any] | None = None,
        idempotency_key: str | None = None,
        idempotent: bool = False,
    ) -> Json:
        headers = self._headers(
            accept="application/json",
            has_json_body=body is not None,
            idempotency_key=idempotency_key,
            idempotent=idempotent,
        )
        response = await self._client.request(
            method,
            self._url(path),
            headers=headers,
            json=body,
        )
        _raise_for_error(response)
        return response.json()

    async def download(self, url: str) -> bytes:
        response = await self._client.get(
            self._url(url),
            headers=self._headers(accept="application/octet-stream"),
        )
        _raise_for_error(response)
        return response.content

    async def stream_sse(
        self,
        path: str,
        *,
        method: str = "GET",
        body: Mapping[str, Any] | None = None,
        idempotency_key: str | None = None,
        idempotent: bool = False,
    ) -> AsyncIterator[Json]:
        async with self._client.stream(
            method,
            self._url(path),
            headers=self._headers(
                accept="text/event-stream",
                has_json_body=body is not None,
                idempotency_key=idempotency_key,
                idempotent=idempotent,
            ),
            json=body,
        ) as response:
            if not response.is_success:
                await response.aread()
            _raise_for_error(response)
            async for event in parse_async_sse_events(response.aiter_text()):
                yield event

    def _headers(
        self,
        *,
        accept: str,
        has_json_body: bool = False,
        idempotency_key: str | None = None,
        idempotent: bool = False,
    ) -> dict[str, str]:
        headers = {
            "accept": accept,
            "authorization": f"Bearer {self._api_key}",
        }
        if has_json_body:
            headers["content-type"] = "application/json"
        if idempotency_key is not None:
            headers["idempotency-key"] = idempotency_key
        elif idempotent:
            headers["idempotency-key"] = _create_idempotency_key()
        return headers

    def _url(self, value: str) -> str:
        return _resolve_url(self._base_url, value)


def parse_sse_events(chunks: Iterable[str]) -> Iterator[Json]:
    buffer = ""
    for chunk in chunks:
        buffer += chunk
        parts = buffer.split("\n\n")
        buffer = parts.pop() or ""
        for part in parts:
            payload = _parse_sse_payload(part)
            if payload is not None:
                yield payload

    payload = _parse_sse_payload(buffer)
    if payload is not None:
        yield payload


async def parse_async_sse_events(chunks: AsyncIterator[str]) -> AsyncIterator[Json]:
    buffer = ""
    async for chunk in chunks:
        buffer += chunk
        parts = buffer.split("\n\n")
        buffer = parts.pop() or ""
        for part in parts:
            payload = _parse_sse_payload(part)
            if payload is not None:
                yield payload

    payload = _parse_sse_payload(buffer)
    if payload is not None:
        yield payload


def _parse_sse_payload(event: str) -> Json | None:
    data = "\n".join(
        line.removeprefix("data:").lstrip()
        for line in event.splitlines()
        if line.startswith("data:")
    )
    if not data:
        return None
    return json.loads(data)


def _resolve_api_key(api_key: str | None) -> str:
    resolved = api_key if api_key is not None else os.environ.get("CROWNEST_API_KEY")
    if not resolved:
        raise ValueError(
            "CrowNest API key missing. Pass api_key to CrowNest or set CROWNEST_API_KEY."
        )
    return resolved


def _raise_for_error(response: httpx.Response) -> None:
    if response.is_success:
        return

    try:
        payload = response.json()
    except Exception:
        error = {
            "code": "invalid_error_response",
            "message": (
                f"Request failed with status {response.status_code} "
                "and a non-JSON response body."
            ),
        }
    else:
        if isinstance(payload, Mapping) and isinstance(payload.get("error"), Mapping):
            error = payload["error"]
        else:
            error = {
                "code": "invalid_error_response",
                "details": {"body": payload},
                "message": (
                    f"Request failed with status {response.status_code} "
                    "and an unexpected JSON error response."
                ),
            }

    raise CrowNestApiError(response.status_code, error)


def _resolve_url(base_url: str, value: str) -> str:
    if value.startswith(("http://", "https://")):
        return value
    if value.startswith("/"):
        return f"{base_url}{value}"
    return f"{base_url}/{value}"


def _create_idempotency_key() -> str:
    return str(uuid.uuid4())
