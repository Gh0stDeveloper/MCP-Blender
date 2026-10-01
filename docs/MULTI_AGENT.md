# Multi-agent production

Forge Cloud treats an Agent Team as a project-level production configuration.

## Runtime

A job executes in three stages:

1. **Coordinator** — converts the human request into an ordered 3D production plan.
2. **Specialists** — enabled specialist agents execute their analysis concurrently.
3. **Reviewer** — consolidates the coordinator plan and specialist outputs into a conflict-free Blender execution sequence.

The current cloud orchestrator produces the plan that Nexora Forge MCP should execute. It deliberately does not claim Blender operations occurred unless a Device Agent/MCP worker actually performs them.

## Roles

Supported initial roles:

- coordinator
- modeler
- materials
- rigger
- animator
- environment
- reviewer
- exporter

An Agent Team supports 2–6 enabled agents per run.

## Providers

Direct adapters:

- OpenAI
- Anthropic
- DeepSeek
- xAI
- custom OpenAI-compatible endpoint

Normalized route:

- Vercel AI Gateway

Each agent independently selects provider, connection mode and model.

## Cost controls

- dry-run sends no provider requests;
- task input is capped;
- maximum enabled agent count is capped;
- per-agent output is capped;
- specialist work runs in parallel to reduce wall-clock latency.

For larger local/team installations, optional per-project budgets, hard spend caps and per-provider usage metering can be added around the same orchestrator.
