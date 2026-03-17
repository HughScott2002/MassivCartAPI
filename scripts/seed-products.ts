/**
 * Seed the Supabase products table with ~300-500 realistic Jamaican retail products.
 * Uses Claude to generate SKU-level product data per category and brand.
 *
 * Run with: npx tsx scripts/seed-products.ts
 *
 * Prerequisites:
 *   - SUPABASE_URL, SUPABASE_ANON_KEY (+ SUPABASE_SERVICE_ROLE_KEY recommended), ANTHROPIC_API_KEY in .env
 *
 * On re-run: reads data/products-seed.json if it exists and skips LLM calls.
 */
import "dotenv/config";
import "../src/config/env.js";
import { writeFile, readFile } from "fs/promises";
import path from "path";
import { supabase, supabaseAdmin } from "../src/db/supabase-client.js";
import { logInfo, logError, logWarn } from "../src/utils/logger.js";

// ---------------------------------------------------------------------------
// Category → brand mapping
// ---------------------------------------------------------------------------
const PRODUCERS_BY_CATEGORY: Record<string, string[]> = {
  pantry: [
    "Grace Kennedy",
    "Excelsior",
    "Lasco",
    "Seprod",
    "Caribbean Dreams",
    "Bigga",
  ],
  dairy: [
    "Lasco",
    "Seprod",
    "Grace Kennedy",
    "Breeze",
    "Serge Island",
  ],
  beverages: [
    "Wisynco",
    "Pepsi/Carib",
    "Ribena/GSK",
    "Grace Kennedy",
    "Lasco",
    "Red Bull",
  ],
  snacks: [
    "Excelsior",
    "Shirley",
    "Grace Kennedy",
    "Tastee",
    "Island Grill",
  ],
  condiments: [
    "Grace Kennedy",
    "Walkerswood",
    "Pick-a-Pepper",
    "Busha Browne",
    "Tropical Rhythms",
    "Maggi/Nestlé",
  ],
  meat_protein: [
    "Jamaica Broilers (Best Dressed Chicken)",
    "Grace Kennedy",
    "Excelsior",
    "Lasco",
    "Caribbean Choice",
  ],
  personal_care: [
    "Unilever Jamaica",
    "P&G Jamaica",
    "Colgate-Palmolive",
    "Blue Power",
    "Cussons",
  ],
  household: [
    "Clorox Jamaica",
    "Dettol",
    "Lysol",
    "Blue Power",
    "Grace Kennedy",
    "Scotts",
  ],
  medicine: [
    "GlaxoSmithKline",
    "Reckitt",
    "Bayer",
    "Johnson & Johnson",
    "Caribbean pharma",
    "Halls/Mondelez",
  ],
  hardware: [
    "Carib Cement",
    "Caribbean Steel",
    "Hardware & Lumber",
    "Dulux/AkzoNobel",
    "Stanley",
    "Berger Paints",
  ],
  fuel: [
    "Petrojam",
    "Shell Jamaica",
    "Esso/ExxonMobil",
    "Rubis Energy",
  ],
};

// ---------------------------------------------------------------------------
// Product shape returned by the LLM
// ---------------------------------------------------------------------------
interface LLMProduct {
  canonical_name: string;
  category: string;
  unit_type: string;
  aliases: string[];
  typical_unit_price: number;
}

// ---------------------------------------------------------------------------
// Claude API call with large token budget
// ---------------------------------------------------------------------------
async function callClaude(systemPrompt: string, userPrompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY");

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
      max_tokens: 16000,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Claude error: ${response.status} ${response.statusText} ${body}`);
  }

  const data = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const textBlock = data.content?.find((b) => b.type === "text" && b.text);
  if (!textBlock?.text) throw new Error("Claude returned no text content");
  return textBlock.text;
}

// ---------------------------------------------------------------------------
// Extract a JSON array from raw LLM text (handles markdown fences)
// ---------------------------------------------------------------------------
function extractJsonArray(raw: string): LLMProduct[] {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const startIndex = candidate.indexOf("[");
  const endIndex = candidate.lastIndexOf("]");
  if (startIndex < 0 || endIndex <= startIndex) {
    throw new Error("No JSON array found in LLM response");
  }
  return JSON.parse(candidate.slice(startIndex, endIndex + 1)) as LLMProduct[];
}

// ---------------------------------------------------------------------------
// Generate products for one category via LLM
// ---------------------------------------------------------------------------
async function generateCategoryProducts(
  category: string,
  brands: string[],
): Promise<LLMProduct[]> {
  const systemPrompt =
    "You are a product data specialist for a Jamaican grocery price comparison app. " +
    "Return ONLY a valid JSON array. No markdown fences, no explanation, no extra text.";

  const userPrompt =
    `List every specific retail SKU from these brands that a shopper would find at a Jamaican ${category} store:\n` +
    `Brands: ${brands.join(", ")}\n\n` +
    `For each product return a JSON object with:\n` +
    `- canonical_name: "Brand Product Size" format, e.g. "Grace White Rice 2kg" or "Wisynco Wata 500ml"\n` +
    `- category: one of: pantry, dairy, beverages, snacks, condiments, meat_protein, personal_care, household, medicine, hardware, fuel\n` +
    `- unit_type: the size/unit as a string, e.g. "2kg", "400ml", "24s", "94lb bag"\n` +
    `- aliases: 2-5 lowercase search terms a shopper would type to find this product\n` +
    `- typical_unit_price: approximate retail price in JMD (Jamaican Dollars) as a number\n\n` +
    `Return ONLY a valid JSON array. No markdown, no explanation. Include size variants.\n` +
    `Aim for 5-20 products per brand depending on their range.`;

  const raw = await callClaude(systemPrompt, userPrompt);
  return extractJsonArray(raw);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
const SEED_FILE = path.join(process.cwd(), "data", "products-seed.json");

async function main() {
  const client = supabaseAdmin ?? supabase;

  // Check for existing seed file to avoid redundant LLM calls
  let allProducts: LLMProduct[] = [];
  let usedCache = false;

  try {
    const cached = await readFile(SEED_FILE, "utf-8");
    allProducts = JSON.parse(cached) as LLMProduct[];
    logInfo("Loaded products from cache", { count: allProducts.length, file: SEED_FILE });
    usedCache = true;
  } catch {
    // No cache — generate via LLM
    logInfo("No products-seed.json found — generating via LLM", {
      categories: Object.keys(PRODUCERS_BY_CATEGORY).length,
    });
  }

  if (!usedCache) {
    for (const [category, brands] of Object.entries(PRODUCERS_BY_CATEGORY)) {
      logInfo(`Generating products for category: ${category}`, { brands: brands.length });
      try {
        const products = await generateCategoryProducts(category, brands);
        logInfo(`Category done`, { category, count: products.length });
        allProducts.push(...products);
      } catch (err) {
        logError(`Failed to generate products for category "${category}"`, err);
      }
    }

    // Deduplicate by canonical_name
    const seen = new Set<string>();
    allProducts = allProducts.filter((p) => {
      const key = p.canonical_name.toLowerCase().trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    logInfo("Deduplication complete", { total: allProducts.length });

    // Save for reproducibility
    try {
      await writeFile(SEED_FILE, JSON.stringify(allProducts, null, 2), "utf-8");
      logInfo("Saved products to seed file", { file: SEED_FILE });
    } catch (err) {
      logWarn("Could not save products-seed.json", { err });
    }
  }

  // Upsert into Supabase in batches of 50
  const BATCH_SIZE = 50;
  let totalInserted = 0;
  let totalSkipped = 0;

  for (let i = 0; i < allProducts.length; i += BATCH_SIZE) {
    const batch = allProducts.slice(i, i + BATCH_SIZE);
    const rows = batch.map((p) => ({
      canonical_name: p.canonical_name,
      category: p.category,
      unit_type: p.unit_type ?? null,
      aliases: Array.isArray(p.aliases) ? p.aliases : [],
      typical_unit_price: typeof p.typical_unit_price === "number" ? p.typical_unit_price : null,
    }));

    const { error, data } = await client
      .from("products")
      .upsert(rows, { onConflict: "canonical_name", ignoreDuplicates: true })
      .select("id");

    if (error) {
      logError(`Batch upsert failed (batch ${Math.floor(i / BATCH_SIZE) + 1})`, error);
      totalSkipped += batch.length;
    } else {
      const inserted = data?.length ?? 0;
      totalInserted += inserted;
      totalSkipped += batch.length - inserted;
      logInfo(`Batch upserted`, {
        batch: Math.floor(i / BATCH_SIZE) + 1,
        inserted,
        cumulative: totalInserted,
      });
    }
  }

  logInfo("Product seed complete", {
    total: allProducts.length,
    inserted: totalInserted,
    skipped: totalSkipped,
  });
}

main().catch((err: unknown) => {
  logError("seed-products failed", err);
  // eslint-disable-next-line n/no-process-exit
  process.exit(1);
});
