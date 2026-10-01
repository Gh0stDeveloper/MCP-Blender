from nexora_forge_mcp.security import sanitize_for_audit, valid_bearer


def test_valid_bearer() -> None:
    assert valid_bearer("Bearer super-secret-token", "super-secret-token")
    assert valid_bearer("bearer super-secret-token", "super-secret-token")
    assert not valid_bearer("Basic abc", "super-secret-token")
    assert not valid_bearer("Bearer wrong", "super-secret-token")
    assert not valid_bearer(None, "super-secret-token")


def test_sanitize_for_audit() -> None:
    value = {
        "token": "secret",
        "nested": {"password": "pw", "name": "Cube"},
        "items": [{"api_key": "key"}],
    }
    assert sanitize_for_audit(value) == {
        "token": "***",
        "nested": {"password": "***", "name": "Cube"},
        "items": [{"api_key": "***"}],
    }
