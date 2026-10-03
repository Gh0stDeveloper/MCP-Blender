"use client";

import { useEffect, useMemo, useState } from "react";

type ProviderId = "openai" | "anthropic" | "deepseek" | "xai" | "custom";
type ProviderMode = "direct" | "gateway";
type AgentRole =
  | "coordinator"
  | "modeler"
  | "materials"
  | "rigger"
  | "animator"
  | "environment"
  | "reviewer"
  | "exporter";

type Agent = {
  id: string;
  name: string;
  role: AgentRole;
  provider: ProviderId;
  mode: ProviderMode;
  model: string;
  enabled: boolean;
};

type CatalogEntry = {
  provider: ProviderId;
  label: string;
  directModel: string;
  gatewayModel: string;
  strengths: string[];
};

type CatalogResponse = {
  models: CatalogEntry[];
  availability: Record<ProviderId | "gateway", boolean>;
};

type WorkspaceResponse = {
  actor: { kind: string; userId?: string; role: string };
  organization: { id: string; name: string; slug: string } | null;
  projects: Array<{ id: string; name: string; slug: string }>;
};

const providers: ProviderId[] = ["openai", "anthropic", "deepseek", "xai", "custom"];

const initialAgents: Agent[] = [
  {
    id: "coordinator",
    name: "Forge Coordinator",
    role: "coordinator",
    provider: "openai",
    mode: "direct",
    model: "gpt-6.1-sol",
    enabled: true,
  },
  {
    id: "modeler",
    name: "Modeling Agent",
    role: "modeler",
    provider: "openai",
    mode: "direct",
    model: "gpt-6-astra",
    enabled: true,
  },
  {
    id: "rigger",
    name: "Rigging Agent",
    role: "rigger",
    provider: "anthropic",
    mode: "direct",
    model: "claude-sonnet-5-5",
    enabled: true,
  },
  {
    id: "reviewer",
    name: "Review Agent",
    role: "reviewer",
    provider: "deepseek",
    mode: "direct",
    model: "deepseek-v4-pro",
    enabled: true,
  },
  {
    id: "exporter",
    name: "Export Agent",
    role: "exporter",
    provider: "xai",
    mode: "direct",
    model: "grok-4.7",
    enabled: true,
  },
];

function modelFor(
  catalog: CatalogEntry[],
  provider: ProviderId,
  mode: ProviderMode,
): string | undefined {
  if (provider === "custom") return "custom-model";
  const item = catalog.find((entry) => entry.provider === provider);
  return item ? (mode === "gateway" ? item.gatewayModel : item.directModel) : undefined;
}

export default function CloudConsole() {
  const [catalog, setCatalog] = useState<CatalogEntry[]>([]);
  const [availability, setAvailability] = useState<CatalogResponse["availability"] | null>(null);
  const [agents, setAgents] = useState<Agent[]>(initialAgents);
  const [task, setTask] = useState(
    "Create a game-ready zombie character plan with clean topology, a reusable humanoid rig, idle/walk/attack animations, PBR materials and a GLB export validation pass.",
  );
  const [projectId, setProjectId] = useState("");
  const [memberToken, setMemberToken] = useState("");
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [dryRun, setDryRun] = useState(true);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/cloud/catalog", { cache: "no-store" })
      .then((response) => response.json())
      .then((data: CatalogResponse) => {
        setCatalog(data.models);
        setAvailability(data.availability);
      })
      .catch(() => setError("Could not load the model catalog."));
  }, []);

  const enabledCount = useMemo(
    () => agents.filter((agent) => agent.enabled).length,
    [agents],
  );

  function patchAgent(id: string, patch: Partial<Agent>) {
    setAgents((current) =>
      current.map((agent) => {
        if (agent.id !== id) return agent;
        const next = { ...agent, ...patch };
        if (next.provider === "custom") next.mode = "direct";
        if (patch.provider || patch.mode) {
          next.model = modelFor(catalog, next.provider, next.mode) ?? next.model;
        }
        return next;
      }),
    );
  }

  function modelsForAgent(agent: Agent): string[] {
    if (agent.provider === "custom") return [agent.model || "custom-model"];
    return catalog
      .filter((entry) => entry.provider === agent.provider)
      .map((entry) => (agent.mode === "gateway" ? entry.gatewayModel : entry.directModel));
  }

  async function loadWorkspace() {
    setRunning(true);
    setError("");
    try {
      const response = await fetch("/api/cloud/me", {
        headers: memberToken ? { Authorization: `Bearer ${memberToken}` } : {},
        cache: "no-store",
      });
      const data = (await response.json()) as WorkspaceResponse & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Could not load private workspace");
      setWorkspace(data);
      setProjectId((current) =>
        current && data.projects.some((project) => project.id === current)
          ? current
          : data.projects[0]?.id ?? "",
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load private workspace");
    } finally {
      setRunning(false);
    }
  }

  async function run() {
    setRunning(true);
    setError("");
    setResult("");
    try {
      const response = await fetch("/api/cloud/orchestrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(memberToken ? { Authorization: `Bearer ${memberToken}` } : {}),
        },
        body: JSON.stringify({
          task,
          projectId,
          agents,
          dryRun,
          maxOutputTokens: 1800,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Forge Cloud request failed");
      }
      setResult(JSON.stringify(data, null, 2));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Forge Cloud request failed");
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="cloudConsole">
      <div className="cloudControlBar">
        <div>
          <span className="panelLabel">AGENT TEAM</span>
          <strong>{enabledCount} enabled</strong>
        </div>
        <label className="switchRow">
          <input
            type="checkbox"
            checked={dryRun}
            onChange={(event) => setDryRun(event.target.checked)}
          />
          <span>Dry run</span>
        </label>
      </div>

      <div className="agentGrid">
        {agents.map((agent) => (
          <article className={`agentCard ${agent.enabled ? "" : "disabled"}`} key={agent.id}>
            <div className="agentHeader">
              <div>
                <span>{agent.role}</span>
                <strong>{agent.name}</strong>
              </div>
              <input
                aria-label={`Enable ${agent.name}`}
                type="checkbox"
                checked={agent.enabled}
                onChange={(event) => patchAgent(agent.id, { enabled: event.target.checked })}
              />
            </div>

            <label>
              Provider
              <select
                value={agent.provider}
                onChange={(event) =>
                  patchAgent(agent.id, { provider: event.target.value as ProviderId })
                }
              >
                {providers.map((provider) => (
                  <option key={provider} value={provider}>{provider}</option>
                ))}
              </select>
            </label>

            <label>
              Connection
              <select
                value={agent.mode}
                onChange={(event) =>
                  patchAgent(agent.id, { mode: event.target.value as ProviderMode })
                }
              >
                <option value="direct">Direct provider</option>
                <option value="gateway" disabled={agent.provider === "custom"}>
                  AI Gateway
                </option>
              </select>
            </label>

            <label>
              Model
              <input
                list={`models-${agent.id}`}
                value={agent.model}
                onChange={(event) => patchAgent(agent.id, { model: event.target.value })}
              />
              <datalist id={`models-${agent.id}`}>
                {modelsForAgent(agent).map((model) => (
                  <option key={model} value={model} />
                ))}
              </datalist>
            </label>

            <small>
              {agent.mode === "gateway"
                ? availability?.gateway
                  ? "Gateway configured"
                  : "Gateway key not detected"
                : availability?.[agent.provider]
                  ? "Provider configured"
                  : "Provider key not detected"}
            </small>
          </article>
        ))}
      </div>

      <div className="cloudRunGrid">
        <article className="panel">
          <span className="panelLabel">PRIVATE PROJECT</span>
          <label>
            Member / owner token
            <input
              type="password"
              autoComplete="off"
              value={memberToken}
              onChange={(event) => setMemberToken(event.target.value)}
              placeholder="nfu_..."
            />
          </label>
          <button className="secondaryButton" disabled={running || !memberToken} onClick={loadWorkspace}>
            Load my projects
          </button>
          {workspace?.organization ? (
            <p className="workspaceIdentity">
              {workspace.organization.name} · {workspace.actor.role}
            </p>
          ) : null}
          <label>
            Project
            <select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">Select project</option>
              {workspace?.projects.map((project) => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </label>
          <label>
            Production request
            <textarea
              rows={8}
              value={task}
              onChange={(event) => setTask(event.target.value)}
            />
          </label>
          <button
            className="forgeButton"
            disabled={running || enabledCount < 2 || !projectId || !memberToken}
            onClick={run}
          >
            {running ? "Running…" : dryRun ? "Validate team" : "Run multi-agent job"}
          </button>
          {error ? <p className="cloudError">{error}</p> : null}
        </article>

        <article className="panel cloudOutput">
          <span className="panelLabel">ORCHESTRATION OUTPUT</span>
          {result ? (
            <pre>{result}</pre>
          ) : (
            <div className="emptyOutput">
              <strong>No run yet</strong>
              <p>
                Load your private workspace, choose a project and validate the Agent Team before
                enabling provider calls.
              </p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
