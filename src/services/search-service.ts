import {
  SAVINGS_MODE_RADIUS_KM,
  buildSynonymMap,
  extractCanonicalFragment,
  searchProducts,
} from "../database/product-search.js";
import { getPricesForProducts, getProducts, getStores } from "../db/data-access.js";
import type { SearchRequestBody, SearchResult } from "../types/api.types.js";

export interface SearchResponse {
  results: SearchResult[];
  queriedStore?: { id: number; name: string };
}

function resolveRadiusKm(
  savingsMode: number | undefined,
  userLat: number | undefined,
  userLng: number | undefined,
): number | undefined {
  if (userLat == null || userLng == null) {
    return undefined;
  }

  const effectiveSavingsMode = savingsMode ?? 2;
  return (
    SAVINGS_MODE_RADIUS_KM[effectiveSavingsMode] ?? SAVINGS_MODE_RADIUS_KM[2]
  );
}

export async function performSearch(
  request: SearchRequestBody,
): Promise<SearchResponse> {
  const [allStores, allProducts] = await Promise.all([
    getStores(),
    getProducts(),
  ]);

  // Pre-screen: find product IDs that match the search terms so we only
  // fetch prices for relevant products instead of the full 160K+ price table.
  const synonymMap = buildSynonymMap(allProducts);
  const normalizedTerms = request.terms
    .map((t) => t.toLowerCase().trim())
    .filter(Boolean);
  const expandedTerms = [
    ...new Set(normalizedTerms.flatMap((t) => [t, ...(synonymMap[t] ?? [])])),
  ];

  const matchingProductIds = allProducts
    .filter((product) => {
      const name = product.canonical_name.toLowerCase();
      const cat = product.category?.toLowerCase() ?? "";
      const fragment = extractCanonicalFragment(product.canonical_name);
      return expandedTerms.some(
        (term) =>
          name.includes(term) ||
          term.includes(fragment) ||
          cat.includes(term),
      );
    })
    .map((p) => p.id);

  const targetedPrices = await getPricesForProducts(matchingProductIds);

  const results = searchProducts(
    request.terms,
    targetedPrices,
    allStores,
    allProducts,
    request.userLat,
    request.userLng,
    resolveRadiusKm(request.savingsMode, request.userLat, request.userLng),
  );

  const queriedStore = request.storeId != null
    ? allStores.find((s) => s.id === request.storeId)
    : undefined;

  return {
    results,
    ...(queriedStore ? { queriedStore: { id: queriedStore.id, name: queriedStore.name } } : {}),
  };
}
