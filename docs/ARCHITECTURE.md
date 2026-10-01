# Architecture

Nexora Forge MCP has two trust zones.

The Python gateway owns the remote MCP surface on port 8765: authentication, Host and Origin allowlists, permission profiles, workspace confinement, auditing, typed tools, and batch execution.

The Blender extension bridge stays on 127.0.0.1:9876. HTTP worker threads do not call bpy directly. They enqueue work and a persistent bpy.app.timers callback executes it on Blender's main thread.

Request flow:

1. MCP client calls the HTTPS gateway.
2. The gateway validates authentication, network metadata, permissions, and paths.
3. The gateway forwards a structured operation to the local Blender bridge using a separate bridge secret.
4. Blender executes the queued operation on its main thread.
5. The result returns to the MCP client and a sanitized audit event is written.

Permission profiles:

- safe: inspection/read operations only.
- standard: structured scene and asset mutations; default.
- unrestricted: standard operations plus optional Blender Python when both sides explicitly enable it.
