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
  const [projectId, setProjectId] = useState("demo-project");
  const [cloudToken, setCloudToken] = useState("");
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
        if (patch.provider || patch.mode) {
          next.model =
            modelFor(
              catalog,
              (patch.provider ?? agent.provider) as ProviderId,
              (patch.mode ?? agent.mode) as ProviderMode,
            ) ?? next.model;
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

  async function run() {
    setRunning(true);
    setError("");
    setResult("");
    try {
      const response = await fetch("/api/cloud/orchestrate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(cloudToken ? { Authorization: `Bearer ${cloudToken}` } : {}),
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
                  <option key={provider} value={provider}>
                    {provider}
                  </option>
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
          <span className="panelLabel">PROJECT JOB</span>
          <label>
            Project ID
            <input value={projectId} onChange={(event) => setProjectId(event.target.value)} />
          </label>
          <label>
            Production request
            <textarea
              rows={8}
              value={task}
              onChange={(event) => setTask(event.target.value)}
            />
          </label>
          <label>
            Cloud API token
            <input
              type="password"
              autoComplete="off"
              value={cloudToken}
              onChange={(event) => setCloudToken(event.target.value)}
              placeholder="Required when NEXORA_CLOUD_API_TOKEN is configured"
            />
          </label>
          <button className="forgeButton" disabled={running || enabledCount < 2} onClick={run}>
            {running ? "Running agent team…" : dryRun ? "Validate team" : "Run multi-agent job"}
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
                Dry run validates the topology without provider calls. Disable it to execute the
                configured agent team.
              </p>
            </div>
          )}
        </article>
      </div>
    </section>
  );
}
