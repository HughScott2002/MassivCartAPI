import {
  SAVINGS_MODE_RADIUS_KM,
  searchProducts,
} from "../database/in-memory-db.js";
import { getPrices, getProducts, getStores } from "../db/data-access.js";
import type { SearchRequestBody, SearchResult } from "../types/api.types.js";

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
): Promise<SearchResult[]> {
  const [allPrices, allStores, allProducts] = await Promise.all([
    getPrices(),
    getStores(),
    getProducts(),
  ]);

  return searchProducts(
    request.terms,
    allPrices,
    allStores,
    allProducts,
    request.userLat,
    request.userLng,
    resolveRadiusKm(request.savingsMode, request.userLat, request.userLng),
  );
}
