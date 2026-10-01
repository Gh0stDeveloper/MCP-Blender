import type { CloudAgentConfig, ProviderId } from "./types";

const TIMEOUT_MS = 120_000;

function requiredKey(provider: ProviderId): string {
  const keys: Record<ProviderId, string | undefined> = {
    openai: process.env.OPENAI_API_KEY,
    anthropic: process.env.ANTHROPIC_API_KEY,
    deepseek: process.env.DEEPSEEK_API_KEY,
    xai: process.env.XAI_API_KEY,
    custom: process.env.NEXORA_CUSTOM_AI_API_KEY,
  };
  const key = keys[provider];
  if (!key) {
    throw new Error(`Provider ${provider} is not configured on this Forge Cloud deployment`);
  }
  return key;
}

async function requestJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    ...init,
    cache: "no-store",
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 600);
    throw new Error(`Provider request failed (${response.status}): ${detail}`);
  }
  return response.json();
}

function textFromResponses(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof value.output_text === "string" && value.output_text.trim()) {
    return value.output_text.trim();
  }
  return (value.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text ?? "")
    .join("\n")
    .trim();
}

function textFromChat(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  return value.choices?.[0]?.message?.content?.trim() ?? "";
}

function textFromAnthropic(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const value = payload as {
    content?: Array<{ type?: string; text?: string }>;
  };
  return (value.content ?? [])
    .filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text ?? "")
    .join("\n")
    .trim();
}

async function callGateway(
  model: string,
  system: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) throw new Error("AI_GATEWAY_API_KEY is not configured");

  const payload = await requestJson("https://ai-gateway.vercel.sh/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: maxOutputTokens,
    }),
  });
  const text = textFromChat(payload);
  if (!text) throw new Error("AI Gateway returned no text output");
  return text;
}

async function callOpenAIStyleResponses(
  provider: "openai" | "xai",
  model: string,
  system: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  const baseUrl = provider === "openai" ? "https://api.openai.com/v1" : "https://api.x.ai/v1";
  const payload = await requestJson(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredKey(provider)}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: system,
      input: prompt,
      max_output_tokens: maxOutputTokens,
    }),
  });
  const text = textFromResponses(payload);
  if (!text) throw new Error(`${provider} returned no text output`);
  return text;
}

async function callDeepSeek(
  model: string,
  system: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  const payload = await requestJson("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredKey("deepseek")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: maxOutputTokens,
    }),
  });
  const text = textFromChat(payload);
  if (!text) throw new Error("DeepSeek returned no text output");
  return text;
}

async function callAnthropic(
  model: string,
  system: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  const payload = await requestJson("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": requiredKey("anthropic"),
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxOutputTokens,
      system,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const text = textFromAnthropic(payload);
  if (!text) throw new Error("Anthropic returned no text output");
  return text;
}

async function callCustom(
  model: string,
  system: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  const baseUrl = process.env.NEXORA_CUSTOM_AI_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("NEXORA_CUSTOM_AI_BASE_URL is not configured");
  const payload = await requestJson(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requiredKey("custom")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt },
      ],
      max_tokens: maxOutputTokens,
    }),
  });
  const text = textFromChat(payload);
  if (!text) throw new Error("Custom provider returned no text output");
  return text;
}

export async function invokeAgent(
  agent: CloudAgentConfig,
  system: string,
  prompt: string,
  maxOutputTokens: number,
): Promise<string> {
  if (agent.mode === "gateway") {
    return callGateway(agent.model, system, prompt, maxOutputTokens);
  }
  if (agent.provider === "openai" || agent.provider === "xai") {
    return callOpenAIStyleResponses(agent.provider, agent.model, system, prompt, maxOutputTokens);
  }
  if (agent.provider === "deepseek") {
    return callDeepSeek(agent.model, system, prompt, maxOutputTokens);
  }
  if (agent.provider === "custom") {
    return callCustom(agent.model, system, prompt, maxOutputTokens);
  }
  return callAnthropic(agent.model, system, prompt, maxOutputTokens);
}
