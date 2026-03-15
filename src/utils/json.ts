export function extractJsonObjectText(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  const startIndex = candidate.indexOf("{");
  const endIndex = candidate.lastIndexOf("}");

  if (startIndex >= 0 && endIndex > startIndex) {
    return candidate.slice(startIndex, endIndex + 1);
  }

  return candidate;
}

export function parseEmbeddedJson<T>(raw: string): T {
  return JSON.parse(extractJsonObjectText(raw)) as T;
}
