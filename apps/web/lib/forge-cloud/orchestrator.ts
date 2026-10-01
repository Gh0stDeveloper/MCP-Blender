import { randomUUID } from "node:crypto";

import { invokeAgent } from "./providers";
import type {
  AgentRole,
  AgentRunResult,
  CloudAgentConfig,
  OrchestrationRequest,
  OrchestrationResult,
} from "./types";

const ROLE_INSTRUCTIONS: Record<AgentRole, string> = {
  coordinator:
    "You are the production coordinator. Break the request into safe, ordered Blender work packages, identify dependencies, checkpoints and acceptance criteria.",
  modeler:
    "You are the 3D modeler. Focus on geometry, topology, proportions, naming, modularity and game-ready mesh construction.",
  materials:
    "You are the material and UV artist. Focus on UV layout, PBR material strategy, texel density, reusable materials and game-engine constraints.",
  rigger:
    "You are the rigging specialist. Focus on armature structure, bone naming, weights, deformation, constraints and animation readiness.",
  animator:
    "You are the animator. Focus on actions, key poses, timing, loops, root motion, transitions, emotes and export-safe animation design.",
  environment:
    "You are the environment artist. Focus on modular scenes, scale, lighting, instancing, collision considerations and performance.",
  reviewer:
    "You are the production reviewer. Detect inconsistencies, destructive steps, missing validation, game-export risks and opportunities to simplify.",
  exporter:
    "You are the technical export specialist. Focus on naming, transforms, LODs, textures, animation clips, GLB/FBX export and engine-ready validation.",
};

function validateRequest(input: OrchestrationRequest): CloudAgentConfig[] {
  if (typeof input.task !== "string" || input.task.trim().length < 3) {
    throw new Error("task must contain at least 3 characters");
  }
  if (input.task.length > 12_000) {
    throw new Error("task is too large");
  }
  if (!Array.isArray(input.agents)) {
    throw new Error("agents must be an array");
  }
  const active = input.agents.filter((agent) => agent.enabled);
  if (active.length < 2 || active.length > 6) {
    throw new Error("enable between 2 and 6 agents");
  }
  for (const agent of active) {
    if (!agent.id || !agent.name || !agent.model || !ROLE_INSTRUCTIONS[agent.role]) {
      throw new Error("every enabled agent needs id, name, role and model");
    }
  }
  return active;
}

function topologySummary(task: string, agents: CloudAgentConfig[]): string {
  const roster = agents
    .map((agent) => `- ${agent.name}: ${agent.role} using ${agent.provider}/${agent.model} via ${agent.mode}`)
    .join("\n");
  return `Task: ${task}\n\nAgent team:\n${roster}`;
}

async function runAgent(
  agent: CloudAgentConfig,
  system: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<AgentRunResult> {
  const started = Date.now();
  const output = await invokeAgent(agent, system, prompt, maxOutputTokens);
  return {
    agentId: agent.id,
    name: agent.name,
    role: agent.role,
    provider: agent.provider,
    model: agent.model,
    mode: agent.mode,
    output,
    durationMs: Date.now() - started,
  };
}

export async function orchestrate(
  input: OrchestrationRequest,
): Promise<OrchestrationResult> {
  const startedAt = new Date();
  const agents = validateRequest(input);
  const maxOutputTokens = Math.max(256, Math.min(input.maxOutputTokens ?? 1800, 4096));
  const coordinator = agents.find((agent) => agent.role === "coordinator") ?? agents[0];
  const reviewer = agents.find((agent) => agent.role === "reviewer") ?? coordinator;
  const specialists = agents.filter(
    (agent) => agent.id !== coordinator.id && agent.id !== reviewer.id,
  );
  const roster = topologySummary(input.task.trim(), agents);

  if (input.dryRun) {
    return {
      runId: randomUUID(),
      task: input.task.trim(),
      projectId: input.projectId,
      dryRun: true,
      coordinatorPlan:
        "Dry run only. The coordinator would create the production plan before specialists execute in parallel.",
      specialistResults: specialists.map((agent) => ({
        agentId: agent.id,
        name: agent.name,
        role: agent.role,
        provider: agent.provider,
        model: agent.model,
        mode: agent.mode,
        output: "Dry run: no provider request was sent.",
        durationMs: 0,
      })),
      finalReview:
        "Dry run only. The reviewer would consolidate specialist findings into the execution-ready plan.",
      startedAt: startedAt.toISOString(),
      finishedAt: new Date().toISOString(),
    };
  }

  const coordinatorPlan = await invokeAgent(
    coordinator,
    ROLE_INSTRUCTIONS.coordinator,
    `${roster}\n\nCreate the production plan. Do not claim that Blender actions have already happened. Separate proposed MCP/Blender work from verification steps.`,
    maxOutputTokens,
  );

  const specialistResults = await Promise.all(
    specialists.map((agent) =>
      runAgent(
        agent,
        ROLE_INSTRUCTIONS[agent.role],
        `${roster}\n\nCoordinator plan:\n${coordinatorPlan}\n\nProduce your specialist contribution. Be concrete about what Nexora Forge MCP should do in Blender, but do not claim execution occurred.`,
        maxOutputTokens,
      ),
    ),
  );

  const specialistDigest = specialistResults
    .map((result) => `## ${result.name} (${result.role})\n${result.output}`)
    .join("\n\n");

  const finalReview = await invokeAgent(
    reviewer,
    ROLE_INSTRUCTIONS.reviewer,
    `${roster}\n\nCoordinator plan:\n${coordinatorPlan}\n\nSpecialist outputs:\n${specialistDigest}\n\nConsolidate this into a final, conflict-free production sequence for Nexora Forge MCP. Flag destructive operations, checkpoints, review gates and export validation.`,
    maxOutputTokens,
  );

  return {
    runId: randomUUID(),
    task: input.task.trim(),
    projectId: input.projectId,
    dryRun: false,
    coordinatorPlan,
    specialistResults,
    finalReview,
    startedAt: startedAt.toISOString(),
    finishedAt: new Date().toISOString(),
  };
}
