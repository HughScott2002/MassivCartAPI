import type { Database } from "../types/database.types.js";
import type { SearchResult } from "../types/api.types.js";

export type Store = Database["public"]["Tables"]["stores"]["Row"];
export type Product = Database["public"]["Tables"]["products"]["Row"];
export type Price = Database["public"]["Tables"]["prices"]["Row"];

export const SAVINGS_MODE_RADIUS_KM: number[] = [3, 8, 15, 40];

const SIZE_TOKEN_RE =
  /^\d[\d./]*\s*(kg|g|ml|l|lb|ft|gal|tabs?|pk|pack|mg|inch)$/i;
const PUNCT_RE = /[()\/\\]/g;

const MANUALLY_DEFINED_SYNONYMS: Record<string, string[]> = {
  medicine: ["pharmacy"],
  meds: ["pharmacy"],
  gas: ["fuel"],
  gasoline: ["fuel"],
};

export function haversine(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const earthRadiusKm = 6371;
  const deltaLat = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(deltaLng / 2) ** 2;

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function extractCanonicalFragment(name: string): string {
  return name
    .toLowerCase()
    .replace(PUNCT_RE, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0 && !SIZE_TOKEN_RE.test(word))
    .join(" ");
}

export function buildSynonymMap(
  productList: Product[],
): Record<string, string[]> {
  const map: Record<string, string[]> = { ...MANUALLY_DEFINED_SYNONYMS };

  for (const product of productList) {
    for (const alias of product.aliases ?? []) {
      const key = alias.toLowerCase().trim();
      if (!key) {
        continue;
      }

      if (!map[key]) {
        map[key] = [];
      }

      const fragment = extractCanonicalFragment(product.canonical_name);
      if (!map[key].includes(fragment)) {
        map[key].push(fragment);
      }

      if (product.category && !map[key].includes(product.category)) {
        map[key].push(product.category);
      }
    }
  }

  return map;
}

export function buildProductPromptBlock(productList: Product[]): string {
  const lines: string[] = [];

  for (const product of productList) {
    if (!product.aliases?.length) {
      continue;
    }

    const fragment = extractCanonicalFragment(product.canonical_name);
    const quotedAliases = product.aliases.map((alias) => `"${alias}"`).join(", ");
    lines.push(`  ${quotedAliases} -> "${fragment}"`);
  }

  lines.push('  "medicine", "meds" -> "pharmacy"');
  lines.push('  "gas", "gasoline" -> "fuel"');

  return lines.join("\n");
}

export function searchProducts(
  terms: string[],
  allPrices: Price[],
  allStores: Store[],
  allProducts: Product[],
  userLat?: number,
  userLng?: number,
  maxRadiusKm?: number,
): SearchResult[] {
  const synonymMap = buildSynonymMap(allProducts);
  const normalizedTerms = terms
    .map((term) => term.toLowerCase().trim())
    .filter((term) => term.length > 0);

  const expandedTerms = [
    ...new Set(
      normalizedTerms.flatMap((term) => [term, ...(synonymMap[term] ?? [])]),
    ),
  ];

  const matchedProducts = allProducts.filter((product) => {
    const productName = product.canonical_name.toLowerCase();
    const category = product.category?.toLowerCase() ?? "";
    const fragment = extractCanonicalFragment(product.canonical_name);

    return expandedTerms.some(
      (term) =>
        productName.includes(term) ||
        term.includes(fragment) ||
        category.includes(term),
    );
  });

  const hasGeo = userLat != null && userLng != null;
  const productsWithPrices = matchedProducts.filter((product) =>
    allPrices.some((price) => price.product_id === product.id),
  );

  return productsWithPrices
    .map((product) => {
      const rows = allPrices
        .filter((price) => price.product_id === product.id)
        .map((price) => {
          const store = allStores.find((candidate) => candidate.id === price.store_id);
          const distanceKm =
            hasGeo &&
            store?.latitude != null &&
            store.longitude != null
              ? haversine(userLat!, userLng!, store.latitude, store.longitude)
              : null;

          return {
            price,
            store,
            distance_km: distanceKm,
          };
        })
        .filter(
          (row): row is typeof row & { store: Store } => row.store != null,
        );

      let filteredRows = rows;
      if (hasGeo && maxRadiusKm != null) {
        const inRangeRows = rows.filter(
          (row) =>
            row.distance_km != null && row.distance_km <= maxRadiusKm,
        );

        if (inRangeRows.length > 0) {
          filteredRows = inRangeRows;
        }
      }

      const sortedRows = filteredRows.sort(
        (left, right) => left.price.price - right.price.price,
      );

      return {
        product_id: product.id,
        canonical_name: product.canonical_name,
        category: product.category,
        unit_type: product.unit_type,
        cheapest_price: sortedRows[0]?.price.price ?? 0,
        cheapest_store: sortedRows[0]?.store.name ?? "Unknown",
        prices: sortedRows.map((row) => ({
          store_id: row.store.id,
          store_name: row.store.name,
          branch: row.store.branch,
          parish: row.store.parish,
          neighbourhood: row.store.neighbourhood ?? null,
          place_id: row.store.place_id ?? null,
          price: row.price.price,
          confidence_score: row.price.confidence_score,
          date_recorded: row.price.date_recorded,
          distance_km: row.distance_km,
          lat: row.store.latitude ?? null,
          lng: row.store.longitude ?? null,
        })),
      };
    })
    .filter((result) => result.prices.length > 0);
}
