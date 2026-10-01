# Public distribution

The public repository is designed primarily for **self-hosted use**: every user runs Nexora Forge beside their own Blender workstation.

```text
ChatGPT Business/Enterprise/Edu or OpenAI Responses API
                         |
                 Secure MCP Tunnel
                         |
                  user's workstation
                         |
             Nexora Forge MCP :8765
                         |
             Blender Bridge :9876
                         |
                      Blender
```

Users can alternatively publish their own stable HTTPS endpoint and use static Bearer or OAuth mode.

## Shared multi-tenant SaaS

Do not route unrelated users through one Nexora gateway connected to one Blender bridge. A true hosted SaaS needs a separate tenant/device control plane with accounts, device enrollment, outbound workstation agents, tenant-to-device routing, encrypted credentials, quotas, audit retention, revocation and job ownership.

That multi-tenant relay is a separate layer and is intentionally not faked by the local/open-source release.
