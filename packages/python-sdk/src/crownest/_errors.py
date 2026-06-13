from __future__ import annotations

from collections.abc import Mapping
from typing import Any


class CrowNestApiError(Exception):
    """Structured API error raised for non-2xx CrowNest responses."""

    def __init__(
        self,
        status: int,
        error: Mapping[str, Any],
    ) -> None:
        self.status = status
        self.code = str(error.get("code", "unknown_error"))
        self.details = error.get("details")
        message = str(error.get("message", f"Request failed with status {status}."))
        super().__init__(message)
