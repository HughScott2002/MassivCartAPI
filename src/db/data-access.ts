import type { Price, Product, Store } from "../database/in-memory-db.js";
import { supabase } from "./supabase-client.js";
import { withCache } from "./cache.js";

export async function getStores(): Promise<Store[]> {
  const { data } = await withCache("data:stores", "all", async () => {
    const { data: stores, error } = await supabase
      .from("stores")
      .select("*")
      .order("name", { ascending: true });

    if (error) {
      throw error;
    }

    return (stores ?? []) as Store[];
  });

  return data;
}

export async function getProducts(): Promise<Product[]> {
  const { data } = await withCache("data:products", "all", async () => {
    const { data: products, error } = await supabase
      .from("products")
      .select("id, canonical_name, category, unit_type, aliases")
      .order("canonical_name", { ascending: true });

    if (error) {
      throw error;
    }

    return (products ?? []) as Product[];
  });

  return data;
}

export async function getPrices(): Promise<Price[]> {
  const { data } = await withCache("data:prices", "all", async () => {
    const { data: prices, error } = await supabase
      .from("prices")
      .select(
        "id, product_id, store_id, price, unit_price, confidence_score, date_recorded, created_at, currency, is_synthetic",
      );

    if (error) {
      throw error;
    }

    return (prices ?? []).filter(
      (price): price is Price =>
        price.product_id != null && price.store_id != null,
    );
  });

  return data;
}
