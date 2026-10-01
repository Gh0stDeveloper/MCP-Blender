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


def test_static_mode_rejects_short_secrets() -> None:
    with pytest.raises(RuntimeError):
        Settings(public_token="short", bridge_secret="tiny").validate_runtime()


def test_local_mode_requires_loopback() -> None:
    settings = Settings(auth_mode="local", gateway_host="0.0.0.0", bridge_secret="b" * 32)
    with pytest.raises(RuntimeError, match="loopback"):
        settings.validate_runtime()


def test_local_mode_does_not_require_public_token() -> None:
    Settings(
        auth_mode="local",
        gateway_host="127.0.0.1",
        public_token="",
        bridge_secret="b" * 32,
    ).validate_runtime()


def test_oauth_mode_requires_configuration() -> None:
    with pytest.raises(RuntimeError, match="NEXORA_OAUTH_ISSUER_URL"):
        Settings(auth_mode="oauth", bridge_secret="b" * 32).validate_runtime()


def test_oauth_mode_accepts_secure_configuration() -> None:
    Settings(
        auth_mode="oauth",
        gateway_host="0.0.0.0",
        bridge_secret="b" * 32,
        oauth_issuer_url="https://auth.example.com",
        oauth_resource_url="https://mcp.example.com/mcp",
        oauth_introspection_url="https://auth.example.com/oauth/introspect",
        oauth_client_id="nexora-forge",
        oauth_client_secret="client-secret",
        allowed_hosts="mcp.example.com",
        allowed_origins="https://mcp.example.com",
    ).validate_runtime()


def test_workspace_root_resolves() -> None:
    settings = Settings(
        public_token="a" * 32,
        bridge_secret="b" * 32,
        workspace_root=Path("~/NexoraForgeWorkspace"),
    )
    assert settings.resolved_workspace_root.is_absolute()
