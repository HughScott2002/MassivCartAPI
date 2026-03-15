import { createHash } from "node:crypto";
import { supabaseAdmin } from "../db/supabase-client.js";
import { cacheDelete } from "../lib/cache.js";
import type { ReceiptData } from "../types/receipt.types.js";
import { logError, logInfo } from "../utils/logger.js";

export interface ReceiptConfirmResult {
  receiptId: number;
  pointsAwarded: number;
}

export async function processReceiptConfirm(
  receiptData: ReceiptData,
  userId: string,
  _storeAddress: string | null | undefined,
  category: string,
): Promise<ReceiptConfirmResult> {
  if (!supabaseAdmin) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY not configured");
  }

  // 1. Find store by name ILIKE, fall back to first store
  let storeId: number | null = null;

  if (receiptData.store) {
    const { data: matchedStore } = await supabaseAdmin
      .from("stores")
      .select("id")
      .ilike("name", `%${receiptData.store}%`)
      .limit(1)
      .maybeSingle();

    if (matchedStore) {
      storeId = matchedStore.id;
    }
  }

  if (storeId == null) {
    const { data: firstStore } = await supabaseAdmin
      .from("stores")
      .select("id")
      .limit(1)
      .maybeSingle();

    storeId = firstStore?.id ?? null;
  }

  // 2. MD5 duplicate check
  const hashInput = `${userId}${storeId ?? ""}${receiptData.date ?? ""}${receiptData.total ?? ""}`;
  const receiptHash = createHash("md5").update(hashInput).digest("hex");

  const { data: existing } = await supabaseAdmin
    .from("receipts")
    .select("id")
    .eq("receipt_hash", receiptHash)
    .maybeSingle();

  if (existing) {
    logInfo("Receipt confirm: duplicate detected", { receiptHash, userId });
    return { receiptId: existing.id, pointsAwarded: 0 };
  }

  // 3. Insert receipt row
  const { data: receipt, error: receiptError } = await supabaseAdmin
    .from("receipts")
    .insert({
      user_id: userId,
      store_id: storeId,
      receipt_date: receiptData.date ?? null,
      total: receiptData.total ?? null,
      receipt_hash: receiptHash,
      image_type: receiptData.imageType ?? null,
      receipt_category: category,
      source: "ocr",
    })
    .select("id")
    .single();

  if (receiptError || !receipt) {
    throw new Error(`Failed to insert receipt: ${receiptError?.message}`);
  }

  const receiptId = receipt.id;

  // 4. Type-specific inserts
  if ((category === "receipt" || category === "gas_price") && storeId != null) {
    for (const item of receiptData.items) {
      if (!item.price || item.price <= 0) continue;

      const { data: product } = await supabaseAdmin
        .from("products")
        .select("id")
        .ilike("canonical_name", `%${item.name}%`)
        .limit(1)
        .maybeSingle();

      if (product) {
        await supabaseAdmin.from("prices").insert({
          product_id: product.id,
          store_id: storeId,
          price: item.price,
          date_recorded: receiptData.date ?? null,
          confidence_score: 0.8,
          currency: receiptData.currency ?? "JMD",
        });
      }
    }
  } else if (category === "prescription") {
    for (const item of receiptData.items) {
      await supabaseAdmin.from("prescriptions").insert({
        user_id: userId,
        receipt_id: receiptId,
        store_id: storeId,
        medication_name: item.name,
        dosage: item.dosage ?? null,
        price: item.price > 0 ? item.price : null,
        date_prescribed: receiptData.date ?? null,
        prescriber: receiptData.prescriber ?? null,
      } as never);
    }
  }
  // shopping_list → no price inserts

  // 5. Award 100 points — select current points then increment
  const { data: userData } = await supabaseAdmin
    .from("users")
    .select("points")
    .eq("id", userId)
    .maybeSingle();

  const currentPoints = (userData as { points?: number | null } | null)?.points ?? 0;

  const { error: pointsError } = await supabaseAdmin
    .from("users")
    .update({ points: currentPoints + 100 } as never)
    .eq("id", userId);

  if (pointsError) {
    logError("Receipt confirm: failed to award points", pointsError, { userId });
  }

  // 6. Invalidate caches
  await cacheDelete("data:prices");
  await cacheDelete(`dashboard:user:${userId}`);

  logInfo("Receipt confirm: completed", { receiptId, userId, pointsAwarded: 100 });

  return { receiptId, pointsAwarded: 100 };
}
