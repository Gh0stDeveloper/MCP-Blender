from __future__ import annotations

import secrets
from pathlib import Path


def main() -> None:
    target = Path(".env")
    if target.exists():
        raise SystemExit(".env already exists; refusing to overwrite it")

    public_token = secrets.token_urlsafe(48)
    bridge_secret = secrets.token_urlsafe(48)
    workspace = Path("~/NexoraForgeWorkspace").expanduser()
    workspace.mkdir(parents=True, exist_ok=True)

    target.write_text(
        "\n".join(
            [
                "NEXORA_GATEWAY_HOST=127.0.0.1",
                "NEXORA_GATEWAY_PORT=8765",
                f"NEXORA_PUBLIC_TOKEN={public_token}",
                "NEXORA_ALLOWED_HOSTS=127.0.0.1:*,localhost:*,[::1]:*",
                "NEXORA_ALLOWED_ORIGINS=http://127.0.0.1:*,http://localhost:*,http://[::1]:*",
                "NEXORA_BRIDGE_URL=http://127.0.0.1:9876",
                f"NEXORA_BRIDGE_SECRET={bridge_secret}",
                "NEXORA_REQUEST_TIMEOUT_SECONDS=120",
                "NEXORA_PERMISSION_PROFILE=standard",
                "NEXORA_ALLOW_PYTHON_EXEC=false",
                f"NEXORA_WORKSPACE_ROOT={workspace}",
                "NEXORA_AUDIT_LOG=./var/audit.jsonl",
                "NEXORA_LOG_LEVEL=INFO",
                "",
            ]
        ),
        encoding="utf-8",
    )
    print("Created .env and workspace.")
    print("Copy NEXORA_BRIDGE_SECRET into Blender > Nexora Forge MCP preferences.")


if __name__ == "__main__":
    main()
