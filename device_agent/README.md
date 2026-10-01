# Nexora Forge Device Agent

The Device Agent is the outbound-only worker that connects a Blender workstation to Nexora Forge Cloud.

It polls the Cloud control plane for an atomic job lease, executes the allowlisted structured Blender operations against the local loopback bridge, keeps the lease alive, saves a reproducible `.blend` checkpoint, renders a preview, uploads artifacts, and sends the job to human approval.

## Environment

```bash
export NEXORA_CLOUD_URL=https://forge.example.com
export NEXORA_DEVICE_TOKEN=nfd_...
export NEXORA_BRIDGE_SECRET=...
python device_agent/nexora_forge_agent.py
```

Optional:

```bash
export NEXORA_BRIDGE_URL=http://127.0.0.1:9876
export NEXORA_DEVICE_POLL_SECONDS=5
export NEXORA_DEVICE_HTTP_TIMEOUT=180
export NEXORA_DEVICE_MAX_UPLOAD_BYTES=104857600
```

The Device Agent never opens an inbound Internet port. Blender remains reachable only through the local bridge on `127.0.0.1`.
