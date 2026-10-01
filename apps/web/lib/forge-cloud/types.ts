export type ProviderId = "openai" | "anthropic" | "deepseek" | "xai" | "custom";
export type ProviderMode = "direct" | "gateway";

export type AgentRole =
  | "coordinator"
  | "modeler"
  | "materials"
  | "rigger"
  | "animator"
  | "environment"
  | "reviewer"
  | "exporter";

export interface CloudAgentConfig {
  id: string;
  name: string;
  role: AgentRole;
  provider: ProviderId;
  mode: ProviderMode;
  model: string;
  enabled: boolean;
}

export interface ModelCatalogEntry {
  provider: ProviderId;
  label: string;
  directModel: string;
  gatewayModel: string;
  strengths: string[];
}

export interface OrchestrationRequest {
  task: string;
  projectId?: string;
  agents: CloudAgentConfig[];
  dryRun?: boolean;
  maxOutputTokens?: number;
}

export interface AgentRunResult {
  agentId: string;
  name: string;
  role: AgentRole;
  provider: ProviderId;
  model: string;
  mode: ProviderMode;
  output: string;
  durationMs: number;
}

export interface OrchestrationResult {
  runId: string;
  task: string;
  projectId?: string;
  dryRun: boolean;
  coordinatorPlan: string;
  specialistResults: AgentRunResult[];
  finalReview: string;
  startedAt: string;
  finishedAt: string;
}
