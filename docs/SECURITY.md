# Security

This software controls a local Blender session. Treat the MCP gateway as privileged development access.

Required controls:

- Keep the Blender bridge on 127.0.0.1 only.
- Use separate random values for NEXORA_PUBLIC_TOKEN and NEXORA_BRIDGE_SECRET.
- Add the exact public gateway hostname to NEXORA_ALLOWED_HOSTS.
- Keep NEXORA_PERMISSION_PROFILE=standard for normal work.
- Keep unrestricted Python disabled unless a workflow requires it.
- Keep project I/O below NEXORA_WORKSPACE_ROOT.
- Never commit .env, tunnel credentials, authtokens, or OAuth credentials.

The public gateway URL is not itself a secret. Use gateway authentication and, for production, add edge authentication or rate limiting.

Raw Blender Python is gated twice: unrestricted mode must be enabled in the gateway and also in Blender preferences.

Save, import, export and render paths are normalized and checked on both sides.

If credentials are exposed, stop the public ingress, rotate both secrets, review var/audit.jsonl, inspect the Blender project, then reconnect with new credentials.
