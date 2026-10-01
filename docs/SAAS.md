# Nexora Forge Cloud

Nexora Forge Cloud is the optional collaboration and orchestration layer above the local Nexora Forge MCP worker.

## Implemented foundation

The current repository includes the first executable Cloud control-plane slice:

- multi-provider model catalog;
- direct OpenAI, Anthropic, DeepSeek and xAI adapters;
- optional Vercel AI Gateway routing;
- custom OpenAI-compatible provider support;
- configurable agent teams;
- coordinator → parallel specialists → reviewer orchestration;
- dry-run mode that validates an agent topology without spending provider tokens;
- server-side provider credentials only;
- protected orchestration endpoint using `NEXORA_CLOUD_API_TOKEN`;
- Cloud console at `/cloud`;
- relational PostgreSQL schema for organizations, projects, devices, assets, versions, locks, agent profiles and jobs.

The Cloud layer does not expose the Blender bridge. Blender continues to execute on an enrolled workstation through Nexora Forge MCP.

## Collaboration model

Human collaboration and AI collaboration are separate concepts:

```text
Organization
└── Workspace / Project
    ├── Human members
    ├── Blender devices
    ├── Assets + versions + locks
    └── Agent team
        ├── Coordinator
        ├── Modeler
        ├── Rigger / Animator
        ├── Reviewer
        └── Exporter
```

Every agent may use a different provider and model.

## Credentials

For self-hosted deployments, provider keys are environment variables. They are never returned by the model catalog endpoint and are not embedded in the browser bundle.

A hosted multi-tenant service must replace environment-variable credentials with an encrypted secret vault. The database schema stores only a `secret_ref`, never plaintext API keys.

## Remaining hosted-SaaS layers

The repository now has the orchestration foundation, but a full public hosted service still needs:

- account authentication and organizations;
- outbound Device Agent enrollment and persistent device presence;
- tenant-to-device job routing;
- encrypted secret-vault integration for per-organization BYOK credentials;
- durable queues and worker leases;
- object storage for previews and versioned artifacts;
- billing, quotas and usage metering;
- distributed rate limiting;
- project activity feeds and approvals.

These are intentionally listed as remaining layers instead of being represented as already deployed.
