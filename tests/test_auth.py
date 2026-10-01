from nexora_forge_mcp.auth import normalize_audiences, normalize_scopes


def test_normalize_scopes() -> None:
    assert normalize_scopes("blender:read blender:write") == ["blender:read", "blender:write"]
    assert normalize_scopes(["blender:read", "blender:python"]) == [
        "blender:read",
        "blender:python",
    ]


def test_normalize_audiences() -> None:
    assert normalize_audiences("https://mcp.example.com/mcp") == {
        "https://mcp.example.com/mcp"
    }
    assert normalize_audiences(["api://nexora", "https://mcp.example.com/mcp"]) == {
        "api://nexora",
        "https://mcp.example.com/mcp",
    }
