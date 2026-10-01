from __future__ import annotations

import os

from openai import OpenAI


def main() -> None:
    model = os.environ["OPENAI_MODEL"]
    prompt = os.environ.get(
        "NEXORA_PROMPT",
        "Inspect the Blender scene and report what is currently loaded.",
    )
    tunnel_id = os.environ.get("OPENAI_MCP_TUNNEL_ID")
    server_url = os.environ.get("NEXORA_MCP_URL")
    authorization = os.environ.get("NEXORA_MCP_AUTHORIZATION")

    tool: dict[str, object] = {
        "type": "mcp",
        "server_label": "nexora_forge",
        "server_description": "Nexora Forge MCP controls a Blender workstation for 3D production.",
    }

    if tunnel_id:
        tool["tunnel_id"] = tunnel_id
    elif server_url:
        tool["server_url"] = server_url
        if authorization:
            tool["authorization"] = authorization
    else:
        raise SystemExit(
            "Set OPENAI_MCP_TUNNEL_ID for Secure MCP Tunnel, or NEXORA_MCP_URL for a remote server."
        )

    client = OpenAI()
    response = client.responses.create(
        model=model,
        input=prompt,
        tools=[tool],  # type: ignore[list-item]
    )
    print(response.output_text)


if __name__ == "__main__":
    main()
