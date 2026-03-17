import {
  ANTHROPIC_API_URL,
  ANTHROPIC_API_VERSION,
  DEFAULT_ANTHROPIC_MODEL,
} from "../config/constants.js";
import type { ClaudeConfig, LLMMessage, LLMProvider } from "./types.js";

export function makeClaudeProvider(config: ClaudeConfig = {}): LLMProvider {
  const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY ?? "";
  const model =
    config.model ??
    process.env.ANTHROPIC_MODEL ??
    DEFAULT_ANTHROPIC_MODEL;

  if (!apiKey) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  return async function claudeProvider(messages: LLMMessage[]): Promise<string> {
    const system = messages.find((message) => message.role === "system")?.content;
    const userMessages = messages
      .filter((message) => message.role !== "system")
      .map((message) => ({
        role: message.role,
        content: message.content,
      }));

    const payload: Record<string, unknown> = {
      model,
      max_tokens: config.maxTokens ?? 1024,
      messages: userMessages,
    };

    if (system) {
      payload.system = system;
    }

    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_API_VERSION,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Claude error: ${response.status} ${response.statusText} ${body}`);
    }

    const data = (await response.json()) as {
      content?: Array<{ type: string; text?: string }>;
    };

    const textBlock = data.content?.find((block) => block.type === "text" && block.text);
    if (!textBlock?.text) {
      throw new Error("Claude returned no text content");
    }

    return textBlock.text;
  };
}
