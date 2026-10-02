# Nexora Forge Device Agent

The Device Agent is the outbound-only worker that connects a Blender workstation to a private Nexora Forge Team Host.

It polls the control plane for an atomic job lease, executes allowlisted structured Blender operations against the local loopback bridge, keeps the lease alive, saves a reproducible `.blend` checkpoint, renders a preview, uploads artifacts and sends the job to human approval.

## Recommended enrollment

The recommended flow uses a one-time pairing code instead of manually copying a Device Agent token.

A team owner/admin creates the member:

```bash
nexora-forge member add --name "Artist A" --role artist
```

The new workstation runs:

```bash
nexora-forge setup \
  --mode join-team \
  --server http://TEAM-HOST:3000 \
  --code NXR-ABCD-EFGH-JKLM
```

The setup command stores the new member token and Device Agent token locally.

After configuring the Blender extension with `NEXORA_BRIDGE_SECRET`:

```bash
nexora-forge start
```

## Manual environment

Manual Device Agent configuration is still supported:

```bash
export NEXORA_CLOUD_URL=http://TEAM-HOST:3000
export NEXORA_DEVICE_TOKEN=nfd_...
export NEXORA_BRIDGE_SECRET=...
uv run python device_agent/nexora_forge_agent.py
```

Optional:

```bash
export NEXORA_BRIDGE_URL=http://127.0.0.1:9876
export NEXORA_DEVICE_POLL_SECONDS=5
export NEXORA_DEVICE_HTTP_TIMEOUT=180
export NEXORA_DEVICE_MAX_UPLOAD_BYTES=104857600
```

The Device Agent never opens an inbound Internet port. Blender remains reachable only through the local bridge on `127.0.0.1`.

## Diagnostics

Use:

```bash
nexora-forge status
nexora-forge doctor
```

The installer keeps Device Agent logs under:

```text
.nexora/logs/device-agent.log
```
