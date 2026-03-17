/**
 * Deletes synthetic stores that have no price rows.
 * Safe to run any time — preserves synthetic stores that do have prices.
 */
import "dotenv/config";
import "../src/config/env.js";
import { supabaseAdmin } from "../src/db/supabase-client.js";
import { logInfo, logError } from "../src/utils/logger.js";

async function main() {
  if (!supabaseAdmin) throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");

  // Find synthetic store IDs that have no price rows
  const { data: syntheticStores, error: storeErr } = await supabaseAdmin
    .from("stores")
    .select("id")
    .eq("is_synthetic", true);

  if (storeErr || !syntheticStores) {
    logError("Failed to fetch synthetic stores", storeErr);
    return;
  }

  const storeIds = syntheticStores.map((s: { id: number }) => s.id);
  logInfo("Synthetic stores found", { count: storeIds.length });

  if (storeIds.length === 0) {
    logInfo("Nothing to clean up");
    return;
  }

  // Find which of those have prices
  const { data: storesWithPrices } = await supabaseAdmin
    .from("prices")
    .select("store_id")
    .in("store_id", storeIds);

  const withPricesSet = new Set((storesWithPrices ?? []).map((p: { store_id: number | null }) => p.store_id));
  const phantomIds = storeIds.filter((id: number) => !withPricesSet.has(id));

  logInfo("Phantom stores (no prices)", { count: phantomIds.length });

  if (phantomIds.length === 0) {
    logInfo("No phantoms to delete");
    return;
  }

  const { error: delErr } = await supabaseAdmin
    .from("stores")
    .delete()
    .in("id", phantomIds);

  if (delErr) {
    logError("Delete failed", delErr);
  } else {
    logInfo("Deleted phantom stores", { count: phantomIds.length });
  }
}

main().catch(console.error);
