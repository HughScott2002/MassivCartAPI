import type { Price, Product, Store } from "../database/in-memory-db.js";
import { supabase } from "./supabase-client.js";
import { cacheGet, cacheSet } from "../lib/cache.js";

export async function getStores(): Promise<Store[]> {
  const cacheKey = "data:stores";
  const cachedStores = await cacheGet<Store[]>(cacheKey);

  if (cachedStores) {
    return cachedStores;
  }

  const { data: stores, error } = await supabase
    .from("stores")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw error;
  }

  const result = (stores ?? []) as Store[];
  await cacheSet(cacheKey, result, 300);
  return result;
}

export async function getProducts(): Promise<Product[]> {
  const cacheKey = "data:products";
  const cachedProducts = await cacheGet<Product[]>(cacheKey);

  if (cachedProducts) {
    return cachedProducts;
  }

  const { data: products, error } = await supabase
    .from("products")
    .select("id, canonical_name, category, unit_type, aliases")
    .order("canonical_name", { ascending: true });

  if (error) {
    throw error;
  }

  const result = (products ?? []) as Product[];
  await cacheSet(cacheKey, result, 300);
  return result;
}

export async function getPrices(): Promise<Price[]> {
  const cacheKey = "data:prices";
  const cachedPrices = await cacheGet<Price[]>(cacheKey);

  if (cachedPrices) {
    return cachedPrices;
  }

  const { data: prices, error } = await supabase
    .from("prices")
    .select(
      "id, product_id, store_id, price, unit_price, confidence_score, date_recorded, created_at, currency, is_synthetic",
    );

  if (error) {
    throw error;
  }

  const result = (prices ?? []).filter(
    (price): price is Price =>
      price.product_id != null && price.store_id != null,
  );
  await cacheSet(cacheKey, result, 300);
  return result;
}
