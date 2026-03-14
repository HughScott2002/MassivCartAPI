import { makeClaudeProvider } from "./providers.js";
import type { LLMProvider } from "./types.js";

export function getProvider(): LLMProvider {
  const provider = process.env.LLM_PROVIDER;

  if (provider && provider !== "claude") {
    throw new Error(
      `Unsupported LLM provider "${provider}". MASSIVCartAPI command only supports "claude".`,
    );
  }

  return makeClaudeProvider();
}
