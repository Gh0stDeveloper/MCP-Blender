# Local and private distribution

The repository is designed for **local and privately self-hosted use**. Each user or team runs Nexora Forge beside the Blender workstations they control.

For direct local use:

```text
AI / MCP client
      |
      v
Nexora Forge MCP :8765
      |
      | localhost
      v
Blender Bridge :9876
      |
      v
Blender
```

For OpenAI products that need to reach a private workstation, Secure MCP Tunnel can provide the transport while the Nexora Forge gateway remains local:

```text
ChatGPT / Responses API
          |
   Secure MCP Tunnel
          |
          v
Nexora Forge MCP :8765
          |
      localhost
          |
          v
Blender Bridge :9876
          |
          v
Blender
```

For teams, Forge Cloud can be run on a machine or server owned by the team and used only inside their trusted/private environment. Each Blender workstation connects through its outbound Device Agent.

Do not expose the Blender bridge itself to the Internet. If remote access to the MCP gateway or private control plane is required, place it behind an authenticated tunnel or equivalent private-access layer.
