import { readFile } from "fs/promises";
import path from "path";
import { createHash } from "crypto";
import { supabase, supabaseAdmin } from "./supabase-client.js";
import { getProducts } from "./data-access.js";
import { cacheDelete } from "../lib/cache.js";
import { makeClaudeProvider } from "../llm/providers.js";
import { parseEmbeddedJson } from "../utils/json.js";
import { logError, logInfo, logWarn } from "../utils/logger.js";
import type { Product } from "../database/product-search.js";
import type { Database } from "../types/database.types.js";

type StoreInsert = Database["public"]["Tables"]["stores"]["Insert"];
type PriceInsert = Database["public"]["Tables"]["prices"]["Insert"];
type WealthTier = "budget" | "mid" | "upscale";

// Must match the category mapping in MassivCartUI/app/api/pois/route.ts
const GOOGLE_TYPE_TO_STORE_TYPE: Record<string, string> = {
  supermarket: "grocery",
  grocery_or_supermarket: "grocery",
  convenience_store: "grocery",
  pharmacy: "pharmacy",
  gas_station: "fuel",
  hardware_store: "hardware",
};

const WHOLESALE_PATTERN = /wholesale|pricesmart|costco|superplus/i;

interface PlaceEntry {
  place_id: string;
  name: string;
  vicinity: string;
  types: string[];
  geometry: { location: { lat: number; lng: number } };
  plus_code?: { compound_code?: string };
  rating?: number;
}

interface StoresCache {
  places?: PlaceEntry[];
}

function getStoreType(place: PlaceEntry): string | null {
  if (WHOLESALE_PATTERN.test(place.name)) return "wholesale";
  for (const t of place.types) {
    const mapped = GOOGLE_TYPE_TO_STORE_TYPE[t];
    if (mapped) return mapped;
  }
  return null;
}

/**
 * Extracts the neighbourhood name from a Google Places plus_code compound_code.
 * Format: "24GX+2W Black River, Jamaica" → "Black River"
 */
function extractNeighbourhood(compoundCode: string | undefined): string | null {
  if (!compoundCode) return null;
  const afterCode = compoundCode.replace(/^[A-Z0-9]+\+[A-Z0-9]+\s/, "");
  const neighbourhood = afterCode.split(",")[0].trim();
  return neighbourhood || null;
}

/**
 * Deterministic ±5% price variation per (store, product) pair.
 * Uses the first byte of the MD5 hash to map into [0.95, 1.05].
 */
function deterministicVariation(storeName: string, productId: number): number {
  const hash = createHash("md5").update(`${storeName}:${productId}`).digest();
  const byte = hash[0] ?? 128;
  return 1 + (byte / 255) * 0.1 - 0.05;
}

function buildPricePrompt(products: Product[], tier: WealthTier, storeType: string): string {
  const tierDescription =
    tier === "budget"
      ? "budget / discount store (10-20% below average Jamaican retail prices)"
      : tier === "mid"
        ? "regular / mid-range store (at typical Jamaican retail prices)"
        : "upscale / premium store (10-25% above average Jamaican retail prices)";

  const productLines = products
    .map(
      (p) =>
        `  id:${p.id} | ${p.canonical_name}${p.unit_type ? ` (${p.unit_type})` : ""}${p.category ? ` [${p.category}]` : ""}`,
    )
    .join("\n");

  return (
    `Generate realistic retail prices in JMD (Jamaican Dollars) for a ${tier} ${storeType} store (${tierDescription}).\n` +
    `IMPORTANT: Only include products that a ${storeType} store would actually sell. Omit unrelated products entirely.\n` +
    `Return ONLY a JSON object mapping each product id (integer) to its price (number). ` +
    `No markdown fences, no currency symbols, no explanation.\n\n` +
    `Products:\n${productLines}`
  );
}

export interface SeedResult {
  seededStores: number;
  seededPrices: number;
  parish: string;
}

export async function runSyntheticSeed(parish: string): Promise<SeedResult> {
  const client = supabaseAdmin ?? supabase;

  // 1. Load stores-cache.json
  const cachePath = path.join(process.cwd(), "data", "stores-cache.json");
  let raw: string;
  try {
    raw = await readFile(cachePath, "utf-8");
  } catch {
    throw new Error(
      "data/stores-cache.json not found — copy MassivCartUI/data/stores-cache.json " +
        "to MassivCartAPI/data/stores-cache.json, or run the places-sync script first",
    );
  }

  const cache = JSON.parse(raw) as StoresCache;
  if (!cache.places || cache.places.length === 0) {
    throw new Error(
      "data/stores-cache.json is empty — run the places-sync script first",
    );
  }

  // 2. Filter by parish using plus_code compound_code or vicinity
  const parishLower = parish.toLowerCase();
  const parishMatches = cache.places.filter((p) => {
    const compound = (p.plus_code?.compound_code ?? "").toLowerCase();
    return (
      compound.includes(parishLower) ||
      p.vicinity.toLowerCase().includes(parishLower)
    );
  });

  const placesToSeed = parishMatches.length > 0 ? parishMatches : cache.places;
  if (parishMatches.length === 0) {
    logWarn("No places matched parish filter — seeding all places", {
      parish,
      total: cache.places.length,
    });
  }

  // 3. Keep only places with a mappable store type
  const seedable = placesToSeed
    .map((p) => ({ ...p, storeType: getStoreType(p) }))
    .filter(
      (p): p is PlaceEntry & { storeType: string } => p.storeType !== null,
    );

  if (seedable.length === 0) {
    throw new Error(
      `No seedable places found for parish "${parish}" — check that stores-cache.json contains recognisable store types`,
    );
  }

  logInfo("Synthetic seeder: places selected", {
    parish,
    totalInCache: cache.places.length,
    parishMatches: parishMatches.length,
    seedable: seedable.length,
  });

  // 4. Load products from Supabase (FK safety — product IDs must exist before inserting prices)
  const products = await getProducts();
  if (products.length === 0) {
    throw new Error(
      "No products found in the products table — seed products before running the synthetic seeder",
    );
  }

  const provider = makeClaudeProvider({ maxTokens: 16000 });

  // 5. LLM call 1 — classify every store by wealth tier
  const classifyResponse = await provider([
    {
      role: "system",
      content:
        'You are a retail analyst familiar with Jamaican grocery chains and local stores. ' +
        'Classify each store as "budget", "mid", or "upscale" based on its name and known market positioning. ' +
        'Return ONLY a valid JSON object where each key is the exact store name and the value is ' +
        'one of: "budget", "mid", "upscale". No markdown, no explanation.',
    },
    {
      role: "user",
      content: `Classify these Jamaican retail stores by wealth tier:\n${seedable.map((p, i) => `${i + 1}. ${p.name}`).join("\n")}`,
    },
  ]);

  let tierMap: Record<string, WealthTier>;
  try {
    tierMap = parseEmbeddedJson<Record<string, WealthTier>>(classifyResponse);
    logInfo("Store tier classification complete", {
      classified: Object.keys(tierMap).length,
      total: seedable.length,
    });
  } catch {
    logWarn("Failed to parse tier classification response — defaulting all stores to mid");
    tierMap = {};
  }

  // 6. Lazy price cache — generate on first use per (storeType, tier) combination
  const priceCache = new Map<string, Record<number, number>>();

  async function getOrGeneratePrices(
    storeType: string,
    tier: WealthTier,
  ): Promise<Record<number, number>> {
    const key = `${storeType}-${tier}`;
    if (priceCache.has(key)) return priceCache.get(key)!;

    try {
      const response = await provider([
        {
          role: "system",
          content:
            "You are a pricing analyst for Jamaican retail stores. " +
            "Return ONLY a valid JSON object mapping product_id (integer) to price (number). " +
            "No markdown fences, no currency symbols, no text explanation.",
        },
        { role: "user", content: buildPricePrompt(products, tier, storeType) },
      ]);

      const parsed = parseEmbeddedJson<Record<string, number>>(response);
      const prices: Record<number, number> = {};
      for (const [idStr, price] of Object.entries(parsed)) {
        const productId = Number(idStr);
        if (Number.isFinite(productId) && Number.isFinite(price) && price > 0) {
          prices[productId] = price;
        }
      }

      logInfo("Price generation complete", {
        storeType,
        tier,
        productsCovered: Object.keys(prices).length,
        totalProducts: products.length,
      });

      priceCache.set(key, prices);
      return prices;
    } catch (err) {
      logError(`Price generation failed for storeType="${storeType}" tier="${tier}"`, err);
      const empty: Record<number, number> = {};
      priceCache.set(key, empty);
      return empty;
    }
  }

  // 7. Insert stores + prices
  let seededStores = 0;
  let seededPrices = 0;
  const today = new Date().toISOString().split("T")[0]!;

  for (const place of seedable) {
    const tier: WealthTier = (tierMap[place.name] as WealthTier | undefined) ?? "mid";
    const basePrices = await getOrGeneratePrices(place.storeType, tier);

    if (Object.keys(basePrices).length === 0) {
      logWarn("Skipping store — no base prices available for its tier", {
        name: place.name,
        tier,
      });
      continue;
    }

    const storeInsert: StoreInsert = {
      name: place.name,
      branch: null,
      latitude: place.geometry.location.lat,
      longitude: place.geometry.location.lng,
      parish,
      place_id: place.place_id,
      store_type: place.storeType,
      is_synthetic: true,
    };

    const { data: insertedStore, error: storeError } = await client
      .from("stores")
      .insert(storeInsert)
      .select("id, name")
      .single();

    if (storeError || !insertedStore) {
      logError("Failed to insert synthetic store", storeError, {
        name: place.name,
      });
      continue;
    }

    seededStores++;

    // Build price rows with deterministic ±5% variation per (store, product) pair
    const priceRows: PriceInsert[] = [];
    for (const product of products) {
      const base = basePrices[product.id];
      if (!base) continue;

      const variation = deterministicVariation(place.name, product.id);
      const finalPrice = Math.round(base * variation * 100) / 100;

      priceRows.push({
        product_id: product.id,
        store_id: insertedStore.id,
        price: finalPrice,
        currency: "JMD",
        is_synthetic: true,
        date_recorded: today,
      });
    }

    if (priceRows.length > 0) {
      const PRICE_BATCH = 200;
      let insertError: unknown = null;
      for (let pi = 0; pi < priceRows.length; pi += PRICE_BATCH) {
        const { error } = await client.from("prices").insert(priceRows.slice(pi, pi + PRICE_BATCH));
        if (error) { insertError = error; break; }
      }
      if (insertError) {
        logError("Failed to insert prices for store", insertError, {
          storeId: insertedStore.id,
          name: insertedStore.name,
        });
      } else {
        seededPrices += priceRows.length;
      }
    }

    logInfo("Store seeded", {
      id: insertedStore.id,
      name: insertedStore.name,
      tier,
      neighbourhood: storeInsert.neighbourhood,
      priceRows: priceRows.length,
    });
  }

  // 8. Invalidate data caches so next search hits Supabase
  await Promise.all([cacheDelete("data:stores"), cacheDelete("data:prices")]);

  logInfo("Synthetic seed complete", { parish, seededStores, seededPrices });

  return { seededStores, seededPrices, parish };
}
