import { buildProductPromptBlock } from "../database/in-memory-db.js";
import type { Product } from "../database/in-memory-db.js";
import type { CommandAction, LLMMessage, LLMProvider } from "./types.js";

export interface CommandContext {
  intent: string;
  budget: string;
}

function buildCommandPrompt(productList: Product[]): string {
  const productBlock = buildProductPromptBlock(productList);

  return `You are MASSIV, an AI settings parser for a Jamaican price intelligence shopping app.
The user types anything. Return exactly one JSON object and nothing else.

Fields to extract:
- "budget": number | null
- "savings_mode": 0 | 1 | 2 | 3 | null
- "search_terms": string[] | null
- "text": string

Budget rules:
- "k" suffix means x1000: "70k" = 70000
- NUMBER + "gran" or "grand" means x1000: "70 gran" = 70000
- "gran" or "a gran" alone means exactly 1000
- Dollar amounts are literal: "$15,000" = 15000

Savings mode rules:
- 0 = quick, fast, lazy, convenient, nearest, close by, don't want to drive, stay nearby
- 1 = balanced, moderate, nearby, some savings, 2 stores
- 2 = optimal, good savings, 3 stores
- 3 = extreme, maximum, cheapest possible, best deals, willing to travel, don't mind driving
- Do not set savings_mode to 2 unless the user explicitly asks for that level.

Search terms:
- Extract concrete product/store keywords when the user wants to find or compare items.
- "where's cheapest rice" -> ["rice"]
- "I want chicken and cooking oil" -> ["chicken", "cooking oil"]
- "find panadol" -> ["panadol"]
- "my shopping list is milk, eggs and water" -> ["milk", "eggs", "water"]

Jamaican product vocabulary. Prefer canonical fragments over generic wording:
${productBlock}

Rules:
- Always return valid JSON. No markdown. No explanation.
- If nothing was understood, return:
  {"budget":null,"savings_mode":null,"search_terms":null,"text":"I didn't catch that. Try: 'budget 5000' or 'find rice'"}
- The "text" field must be a short friendly confirmation.

Examples:
"i have gran"
-> {"budget":1000,"savings_mode":null,"search_terms":null,"text":"Budget set to J$1,000"}

"my budget is 70k and I don't want to drive far"
-> {"budget":70000,"savings_mode":0,"search_terms":null,"text":"Budget set to J$70,000 and Quick Trip mode enabled"}

"set budget to 15000"
-> {"budget":15000,"savings_mode":null,"search_terms":null,"text":"Budget set to J$15,000"}

"I only want to go to 2 stores"
-> {"budget":null,"savings_mode":1,"search_terms":null,"text":"Balanced mode enabled"}

"cheapest possible, I have 50k"
-> {"budget":50000,"savings_mode":3,"search_terms":null,"text":"Budget J$50,000 and Extreme mode enabled"}

"where's cheapest rice"
-> {"budget":null,"savings_mode":null,"search_terms":["rice"],"text":"Searching for rice prices across stores"}

"find cheap 87 gas"
-> {"budget":null,"savings_mode":null,"search_terms":["petrol 87"],"text":"Searching for Petrol 87 prices across stations"}`;
}

export function createCommandMessages(
  message: string,
  context: CommandContext,
  productList: Product[],
): LLMMessage[] {
  return [
    {
      role: "system",
      content: buildCommandPrompt(productList),
    },
    {
      role: "user",
      content: `Intent: ${context.intent}\nCurrent budget: ${context.budget || "not set"}\nCommand: ${message}`,
    },
  ];
}

function parseCommandAction(raw: string): CommandAction {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const startIndex = candidate.indexOf("{");
  const endIndex = candidate.lastIndexOf("}");
  const jsonPayload =
    startIndex >= 0 && endIndex > startIndex
      ? candidate.slice(startIndex, endIndex + 1)
      : candidate;

  const parsed = JSON.parse(jsonPayload) as Partial<CommandAction>;

  return {
    budget: typeof parsed.budget === "number" ? parsed.budget : null,
    savings_mode:
      typeof parsed.savings_mode === "number" ? parsed.savings_mode : null,
    search_terms: Array.isArray(parsed.search_terms)
      ? parsed.search_terms.filter(
          (term): term is string => typeof term === "string" && term.trim().length > 0,
        )
      : null,
    text:
      typeof parsed.text === "string" && parsed.text.trim().length > 0
        ? parsed.text
        : `Searching for "${messageFallback(jsonPayload)}"`,
  };
}

function messageFallback(payload: string): string {
  return payload.slice(0, 80).replace(/\s+/g, " ").trim() || "items";
}

export function makeCommandRunner(provider: LLMProvider) {
  return async function runCommand(
    message: string,
    context: CommandContext,
    productList: Product[],
  ): Promise<CommandAction> {
    const messages = createCommandMessages(message, context, productList);
    const raw = await provider(messages);
    return parseCommandAction(raw);
  };
}
