from __future__ import annotations

from collections.abc import Mapping, Sequence
from typing import Any, Literal, NewType, NotRequired, TypedDict

Json = Any
JsonObject = dict[str, Json]
Metadata = Mapping[str, str]

ArtifactId = NewType("ArtifactId", str)
BackupId = NewType("BackupId", str)
CommandId = NewType("CommandId", str)
OrgId = NewType("OrgId", str)
PreviewId = NewType("PreviewId", str)
ProjectId = NewType("ProjectId", str)
SandboxId = NewType("SandboxId", str)
TemplateId = NewType("TemplateId", str)
TemplateVersionId = NewType("TemplateVersionId", str)

FileEncoding = Literal["base64", "utf8"]
CodeArtifactPolicy = Literal["inline_only", "promote"]
CodeLanguage = Literal["python", "javascript", "typescript"]
CommandCancelMode = Literal["force", "graceful"]
CommandCollectOn = Literal["always", "success"]
CommandLogStream = Literal["stderr", "stdout"]
PreviewAuthMode = Literal["authenticated", "token"]
WorkspaceRunStatus = Literal[
    "awaiting_archive",
    "archive_uploaded",
    "starting",
    "extracting",
    "running",
    "collecting",
    "succeeded",
    "failed",
    "canceled",
]


class CommandCollectRequest(TypedDict, total=False):
    path: str
    name: str


class WorkspaceRunArtifactRequest(TypedDict):
    path: str
    name: NotRequired[str]


class RunCommandOptions(TypedDict, total=False):
    collect: Sequence[CommandCollectRequest]
    collectOn: CommandCollectOn
    cwd: str
    env: Mapping[str, str]
    timeoutMs: int


class ApiErrorEnvelope(TypedDict):
    error: "ApiError"


class ApiError(TypedDict):
    code: str
    message: str
    details: NotRequired[dict[str, Any]]
