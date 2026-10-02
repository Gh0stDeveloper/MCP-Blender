# Local installer

Nexora Forge 0.2.0 includes a local setup and lifecycle manager exposed as:

```bash
nexora-forge
```

The installer keeps the project local/private. It does not register users on an external Nexora service and it does not send project files to infrastructure controlled by the project maintainer.

## Install dependencies and launch setup

### Linux / macOS

```bash
./scripts/install.sh
```

### Windows PowerShell

```powershell
.\scripts\install.ps1
```

Both scripts install/sync the Python environment and start the same interactive setup wizard.

You can also run it directly after `uv sync --all-extras`:

```bash
uv run nexora-forge setup
```

## Setup modes

The wizard offers three modes.

### Individual

Use this when one person wants Nexora Forge on one workstation.

```bash
nexora-forge setup --mode individual
```

The installer:

- creates a private `.env`;
- generates independent MCP and Blender bridge secrets;
- creates the local workspace;
- stores installer state under `.nexora/`;
- prepares the MCP gateway.

After setup:

1. install `blender_extension/` in Blender;
2. copy `NEXORA_BRIDGE_SECRET` from `.env` into the extension preferences;
3. start the Blender bridge;
4. run `nexora-forge start`;
5. validate with `nexora-forge doctor`.

### Team Host

Use this on the workstation/server that the team controls.

Requirements:

- Python 3.11+
- uv
- Node.js + npm
- Docker with Compose support

```bash
nexora-forge setup --mode team-host
```

The installer automatically:

- creates the private MCP configuration;
- generates the Cloud/admin secrets;
- starts a private PostgreSQL container;
- applies every migration in `deploy/postgres/`;
- creates the initial organization/project;
- creates the owner membership;
- pairs the host workstation as a Device Agent;
- installs/builds the Next.js control center;
- configures local artifact storage;
- stores the owner/device credentials locally.

The default private control center listens on port `3000` and PostgreSQL is published only on `127.0.0.1:55432`.

Use a LAN address, VPN or authenticated private tunnel if other team workstations need to reach the Team Host.

### Join Team

The team owner/admin creates a member:

```bash
nexora-forge member add --name "Artist A" --role artist
```

The command returns one short-lived setup code:

```text
NXR-ABCD-EFGH-JKLM
```

On the new workstation:

```bash
nexora-forge setup \
  --mode join-team \
  --server http://TEAM-HOST:3000 \
  --code NXR-ABCD-EFGH-JKLM
```

Redeeming the code creates both:

- the member's private access token;
- the Device Agent token for that workstation.

The user does not need to copy UUIDs or database identifiers.

## Lifecycle commands

```bash
nexora-forge start
nexora-forge stop
nexora-forge status
nexora-forge doctor
nexora-forge update
```

### start

Starts the services appropriate to the installation mode.

- Individual: MCP gateway.
- Team Host: PostgreSQL, MCP gateway, web control center and paired Device Agent.
- Join Team: local MCP gateway and Device Agent.

Individual components can be selected:

```bash
nexora-forge start gateway
nexora-forge start web
nexora-forge start agent
```

### stop

Stops processes managed by the local installer.

```bash
nexora-forge stop
```

For Team Host, PostgreSQL normally remains available. To stop it too:

```bash
nexora-forge stop --postgres
```

### status

Shows the current mode, managed process PIDs and local health status for the gateway, Blender bridge and Forge Cloud.

### doctor

Checks the current installation, required executables, local configuration and connectivity.

For Team Host it also checks Node.js, npm, Docker, PostgreSQL and the control center.

### update

Updates the source checkout and then performs the work required by the current mode:

- `git pull --ff-only`;
- `uv sync --all-extras`;
- applies new PostgreSQL migrations for Team Host;
- installs/builds the web control center for Team Host.

## Pairing another device

A member can create a short-lived pairing code for an additional workstation:

```bash
nexora-forge pair
```

Pairing codes expire automatically and are single-use.

## Team members and roles

Owners/admins can add a member from the CLI:

```bash
nexora-forge member add --name "Animator" --role artist
```

Available roles:

- `owner` — full local organization ownership;
- `admin` — team/member administration and production access;
- `lead` — production coordination, jobs, locks and review;
- `artist` — production jobs, own device pairing and asset locks;
- `reviewer` — read access plus human approval decisions;
- `viewer` — read-only project/job/artifact access.

The same role checks are enforced by the Cloud API, not only by the UI.

## Private access token

The Team Host owner token is displayed once during setup and stored locally in:

```text
.nexora/install.json
```

To print the locally stored member/owner token:

```bash
nexora-forge token
```

Treat it like a password.

On Unix-like systems the installer sets `.env` and `.nexora/install.json` to mode `0600`.

## Local runtime files

The installer uses:

```text
.nexora/
├── install.json
├── logs/
└── pids/
```

Local object storage defaults to:

```text
.nexora-storage/
```

Both paths are ignored by Git.

## Manual installation

The individual components can still be configured manually. This is useful for custom deployments, but it is no longer the recommended first-time setup path.

See:

- [Cloud](CLOUD.md)
- [Production pipeline](PRODUCTION_PIPELINE.md)
- [Security](SECURITY.md)
- [Remote access](REMOTE_ACCESS.md)
