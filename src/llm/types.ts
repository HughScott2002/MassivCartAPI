export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export type LLMProvider = (messages: LLMMessage[]) => Promise<string>;

export interface ClaudeConfig {
  apiKey?: string;
  model?: string;
}

export interface CommandAction {
  budget: number | null;
  savings_mode: number | null;
  search_terms: string[] | null;
  text: string;
}
