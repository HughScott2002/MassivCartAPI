import type { CommandAction } from "../llm/types.js";

// ── Budget patterns (first match by position wins) ───────────────────────────

const BUDGET_PATTERNS: [RegExp, (m: RegExpMatchArray) => number][] = [
  [/(\d+(?:\.\d+)?)\s*k\b/i, (m) => parseFloat(m[1]) * 1000],
  [/\b(\d+)\s*gran(?:d)?\b/i, (m) => parseInt(m[1], 10) * 1000],
  [/\b(?:a\s+)?gran\b/i, () => 1000],
  [/\$\s*([\d,]+)/, (m) => parseInt(m[1].replace(/,/g, ""), 10)],
  [/(?:under|budget(?:\s+(?:is|to|of))?|set\s+budget(?:\s+(?:to|at))?)\s+([\d,]+)/i, (m) => parseInt(m[1].replace(/,/g, ""), 10)],
];

function extractBudget(message: string): number | null {
  let best: { index: number; value: number } | null = null;

  for (const [pattern, parse] of BUDGET_PATTERNS) {
    const m = message.match(pattern);
    if (m && m.index !== undefined) {
      if (best === null || m.index < best.index) {
        best = { index: m.index, value: parse(m) };
      }
    }
  }

  return best?.value ?? null;
}

// ── Savings mode patterns (checked in order; first match wins) ───────────────

const SAVINGS_MODE_MATCHERS: [number, RegExp][] = [
  [0, /\b(?:quick|fast|lazy|convenient|nearest|nearest store|close(?:\s+by)?|near(?:by|\s+me)?|don[''t]*\s+want\s+to\s+drive|stay\s+nearby|quick\s+trip)\b/i],
  [1, /\b(?:balanced|moderate|a\s+few\s+stores|2\s+stores|two\s+stores)\b/i],
  [3, /\b(?:extreme|maximum|anywhere|any\s+store|don[''t]*\s+mind\s+(?:driving|traveling)|willing\s+to\s+(?:drive|travel)|furthest|best\s+possible)\b/i],
  [2, /\b(?:cheapest|cheap|best\s+(?:price|deal|value)|save|savings|good\s+deal|lowest\s+price)\b/i],
];

function extractSavingsMode(message: string): number | null {
  for (const [mode, pattern] of SAVINGS_MODE_MATCHERS) {
    if (pattern.test(message)) return mode;
  }
  return null;
}

// ── Combined stripping regex for term extraction ─────────────────────────────

const BUDGET_STRIP_RE =
  /(\d+(?:\.\d+)?)\s*k\b|\b\d+\s*gran(?:d)?\b|\b(?:a\s+)?gran\b|\$[\d,]+|\b(?:under|budget(?:\s+(?:is|to|of))?|set\s+budget(?:\s+(?:to|at))?)\s+[\d,]+/gi;

const MODE_STRIP_RE =
  /\b(?:quick(?:\s+trip)?|fast|lazy|convenient|nearest(?:\s+store)?|close(?:\s+by)?|don[''t]*\s+want\s+to\s+drive|stay\s+nearby|balanced|moderate|a\s+few\s+stores|[23]\s+stores|two\s+stores|extreme|maximum|anywhere|any\s+store|don[''t]*\s+mind\s+(?:driving|traveling)|willing\s+to\s+(?:drive|travel)|furthest|best\s+possible|cheapest|cheap|best\s+(?:price|deal|value)|save(?:ings)?|good\s+deal|lowest\s+price)\b/gi;

const INTENT_STRIP_RE =
  /\b(?:find\s+(?:me\s+(?:the\s+)?)?|show\s+me\s+(?:the\s+)?|get\s+me\s+(?:the\s+)?|search\s+(?:for\s+)?|look(?:ing)?\s+for\s+|where(?:'s|s|\s+is|\s+can\s+i\s+(?:get|buy|find))?\s+|i\s+(?:want|need|would\s+like)\s+|i'?m\s+looking\s+for\s+|do\s+you\s+have\s+|can\s+(?:you\s+)?(?:find|get\s+me)\s+|help\s+me\s+(?:find|get)\s+)/gi;

const STOPWORD_RE =
  /\b(?:the|a|an|some|any|me|my|please|nearby|near|in|at|from|for|is|are|do|can|have|where|i|it|to|with|and|or|of|on|also|too|please)\b/gi;

const SIZE_TOKEN_RE = /^\d[\d./]*\s*(?:kg|g|ml|l|lb|ft|gal|tabs?|pk|pack|mg|inch|oz)$/i;

const STOPWORDS = new Set([
  "the", "a", "an", "some", "any", "me", "my", "please", "nearby", "near",
  "in", "at", "from", "for", "is", "are", "do", "can", "have", "where", "i",
  "it", "to", "with", "and", "or", "of", "on", "also", "too",
]);

function extractTerms(message: string): string[] {
  let working = message.toLowerCase();

  working = working.replace(BUDGET_STRIP_RE, " ");
  working = working.replace(MODE_STRIP_RE, " ");
  working = working.replace(INTENT_STRIP_RE, " ");
  working = working.replace(STOPWORD_RE, " ");
  working = working.replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();

  const tokens = working
    .split(/\s+/)
    .filter(
      (t) =>
        t.length >= 2 &&
        !/^\d+$/.test(t) &&
        !SIZE_TOKEN_RE.test(t) &&
        !STOPWORDS.has(t),
    );

  const unique = [...new Set(tokens)];

  if (unique.length > 0) return unique;

  // Fallback: use original message words ≥ 3 chars, minus stopwords
  return message
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .filter((t, i, arr) => arr.indexOf(t) === i);
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseCommand(message: string): CommandAction {
  const budget = extractBudget(message);
  const savings_mode = extractSavingsMode(message);
  const terms = extractTerms(message);
  const search_terms = terms.length > 0 ? terms : null;

  const text =
    search_terms
      ? `Searching for ${search_terms.join(", ")}...`
      : budget !== null
        ? `Budget set to J$${budget.toLocaleString()}`
        : "What are you looking for?";

  return { budget, savings_mode, search_terms, text };
}
