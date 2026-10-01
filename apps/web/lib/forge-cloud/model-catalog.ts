import type { ModelCatalogEntry, ProviderId, ProviderMode } from "./types";

export const MODEL_CATALOG: ModelCatalogEntry[] = [
  {
    provider: "openai",
    label: "GPT-6 Astra",
    directModel: "gpt-6-astra",
    gatewayModel: "openai/gpt-6-astra",
    strengths: ["complex 3D planning", "long-running agentic work", "tool use"],
  },
  {
    provider: "openai",
    label: "GPT-6.1 Sol",
    directModel: "gpt-6.1-sol",
    gatewayModel: "openai/gpt-6.1-sol",
    strengths: ["balanced intelligence", "production planning", "review"],
  },
  {
    provider: "openai",
    label: "GPT-6 Luna",
    directModel: "gpt-6-luna",
    gatewayModel: "openai/gpt-6-luna",
    strengths: ["high-volume tasks", "cost-sensitive agents"],
  },
  {
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    directModel: "claude-sonnet-5-5",
    gatewayModel: "anthropic/claude-sonnet-5.5",
    strengths: ["agentic work", "coding", "long-context review"],
  },
  {
    provider: "anthropic",
    label: "Claude Opus 5.5",
    directModel: "claude-opus-5-5",
    gatewayModel: "anthropic/claude-opus-5.5",
    strengths: ["hard review", "long-running tasks", "vision"],
  },
  {
    provider: "deepseek",
    label: "DeepSeek V4 Pro",
    directModel: "deepseek-v4-pro",
    gatewayModel: "deepseek/deepseek-v4-pro",
    strengths: ["agentic coding", "reasoning", "cost efficiency"],
  },
  {
    provider: "deepseek",
    label: "DeepSeek Flash",
    directModel: "deepseek-flash",
    gatewayModel: "deepseek/deepseek-v4-flash",
    strengths: ["fast agents", "high-volume review", "low-cost routing"],
  },
  {
    provider: "xai",
    label: "Grok 4.7",
    directModel: "grok-4.7",
    gatewayModel: "spacexai/grok-4.7",
    strengths: ["agentic tasks", "large context", "reasoning"],
  },
];

export function modelsFor(provider: ProviderId, mode: ProviderMode): string[] {
  return MODEL_CATALOG.filter((item) => item.provider === provider).map((item) =>
    mode === "gateway" ? item.gatewayModel : item.directModel,
  );
}

export function providerAvailability(): Record<ProviderId | "gateway", boolean> {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    deepseek: Boolean(process.env.DEEPSEEK_API_KEY),
    xai: Boolean(process.env.XAI_API_KEY),
    gateway: Boolean(process.env.AI_GATEWAY_API_KEY),
  };
}
