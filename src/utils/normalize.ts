export function normalizeQuery(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    // intent phrases
    .replace(/\b(?:i(?:'m|\s+am)?\s+(?:want(?:ing)?|need|looking for|trying to find|searching for|after)|i\s+would\s+like(?: to (?:buy|get|find))?|can you (?:find|get|show)|show me|find me(?: the)?|get me|help me (?:find|get)|where(?:'s| is)(?: the)?|where can i (?:get|buy|find)|what(?:'s| is)(?: the)?|do you have|tell me (?:about|where)|i(?:'d)? like(?: to (?:buy|get|find))?)\b/g, "")
    // price/cost phrases
    .replace(/\b(?:cheapest|cheap|best (?:price|deal|value)|lowest price|price(?:s)?(?: of| for)?|cost(?:s)?(?: of)?|how much (?:is|does|for)|what(?:'s| does) .{0,20} cost)\b/g, "")
    // location phrases
    .replace(/\b(?:near(?:est)?(?: me)?|close(?:st)?(?: to me)?|around me|nearby|in my area|close by)\b/g, "")
    // filler
    .replace(/\b(?:please|asap|quickly|fast|right now|today|the|a|an|some|any)\b/g, "")
    .replace(/\s+/g, " ")
    .trim()
    // strip orphaned leading words after all removals
    .replace(/^(?:find|get|for|buy|show|of|in)\s+/, "")
    .trim();
}
