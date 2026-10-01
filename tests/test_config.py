from pathlib import Path

import pytest

from nexora_forge_mcp.config import Settings


def test_csv_and_transport_security() -> None:
    settings = Settings(
        public_token="a" * 32,
        bridge_secret="b" * 32,
        allowed_hosts="localhost:*,mcp.example.com",
        allowed_origins="http://localhost:*,https://mcp.example.com",
    )
    security = settings.transport_security()
    assert "mcp.example.com" in security.allowed_hosts
    assert "https://mcp.example.com" in security.allowed_origins


def test_validate_rejects_short_secrets() -> None:
    with pytest.raises(RuntimeError):
        Settings(public_token="short", bridge_secret="tiny").validate_runtime()


def test_workspace_root_resolves() -> None:
    settings = Settings(
        public_token="a" * 32,
        bridge_secret="b" * 32,
        workspace_root=Path("~/NexoraForgeWorkspace"),
    )
    assert settings.resolved_workspace_root.is_absolute()
