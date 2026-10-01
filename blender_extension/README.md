# Nexora Forge MCP — Blender extension

This extension is the local execution bridge. It never binds to a public interface: the HTTP server is fixed to `127.0.0.1`.

## Install

1. Package this directory as a Blender extension/add-on.
2. Enable **Nexora Forge MCP**.
3. Open Preferences > Add-ons > Nexora Forge MCP.
4. Set a random bridge secret of at least 32 characters.
5. Select a workspace directory.
6. In the 3D View sidebar, open **Nexora Forge** and click **Start Nexora Bridge**.

Default bridge URL: `http://127.0.0.1:9876`.

## Security

Unrestricted Python is disabled by default and must be enabled both in Blender preferences and in the MCP gateway configuration.
