from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Literal

from mcp.server.transport_security import TransportSecuritySettings
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="NEXORA_",
        extra="ignore",
        case_sensitive=False,
    )

    gateway_host: str = "127.0.0.1"
    gateway_port: int = Field(default=8765, ge=1, le=65535)
    public_token: str = ""

    allowed_hosts: str = "127.0.0.1:*,localhost:*,[::1]:*"
    allowed_origins: str = "http://127.0.0.1:*,http://localhost:*,http://[::1]:*"

    bridge_url: str = "http://127.0.0.1:9876"
    bridge_secret: str = ""
    request_timeout_seconds: float = Field(default=120.0, ge=1.0, le=1800.0)

    permission_profile: Literal["safe", "standard", "unrestricted"] = "standard"
    allow_python_exec: bool = False
    workspace_root: Path = Path("~/NexoraForgeWorkspace")

    audit_log: Path = Path("./var/audit.jsonl")
    log_level: str = "INFO"

    @property
    def resolved_workspace_root(self) -> Path:
        return self.workspace_root.expanduser().resolve()

    @staticmethod
    def _csv(value: str) -> list[str]:
        return [item.strip() for item in value.split(",") if item.strip()]

    def transport_security(self) -> TransportSecuritySettings:
        return TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=self._csv(self.allowed_hosts),
            allowed_origins=self._csv(self.allowed_origins),
        )

    def validate_runtime(self) -> None:
        errors: list[str] = []
        if len(self.public_token) < 32:
            errors.append("NEXORA_PUBLIC_TOKEN must contain at least 32 characters")
        if len(self.bridge_secret) < 32:
            errors.append("NEXORA_BRIDGE_SECRET must contain at least 32 characters")
        if self.public_token and self.bridge_secret and self.public_token == self.bridge_secret:
            errors.append("public token and bridge secret must be different")
        if errors:
            raise RuntimeError("; ".join(errors))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
