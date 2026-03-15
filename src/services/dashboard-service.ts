import { getPrices, getProducts, getStores } from "../db/data-access.js";
import { cacheGet, cacheSet } from "../lib/cache.js";
import { supabase } from "../db/supabase-client.js";
import type { Database } from "../types/database.types.js";

type UserRow = Database["public"]["Tables"]["users"]["Row"];
type ReceiptRow = Database["public"]["Tables"]["receipts"]["Row"];

interface TierDefinition {
  name: string;
  minPoints: number;
}

const WEEKLY_UPLOAD_GOAL = 5;

const TIERS: TierDefinition[] = [
  { name: "shopper", minPoints: 0 },
  { name: "smart_shopper", minPoints: 1_000 },
  { name: "price_scout", minPoints: 3_000 },
  { name: "community_champ", minPoints: 7_500 },
  { name: "elite", minPoints: 15_000 },
];

export class DashboardNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DashboardNotFoundError";
  }
}

export interface DashboardSummary {
  id: string;
  display_name: string;
  points: number;
  tier: string;
  next_tier: string | null;
  tier_progress: number;
  streak_days: number;
  receipts_uploaded: number;
  weekly_uploads: number;
  weekly_upload_goal: number;
  last_upload_at: string | null;
  weekly_budget: number | null;
  parish: string | null;
}

export interface DashboardPriceSummary {
  product_id: number;
  name: string;
  category: string | null;
  cheapest_price: number;
  cheapest_store: string;
  unit_price: number | null;
  unit_type: string | null;
  confidence_score: number | null;
  date_recorded: string | null;
}

export interface DashboardStorePrice {
  product_id: number;
  name: string;
  category: string | null;
  unit_type: string | null;
  price: number;
  unit_price: number | null;
  confidence_score: number | null;
  date_recorded: string | null;
}

function getPoints(user: UserRow): number {
  return user.points ?? 0;
}

function getTierForPoints(points: number): TierDefinition {
  let current = TIERS[0];

  for (const tier of TIERS) {
    if (points >= tier.minPoints) {
      current = tier;
    }
  }

  return current;
}

function getNextTier(currentTierName: string): TierDefinition | null {
  const index = TIERS.findIndex((tier) => tier.name === currentTierName);

  if (index < 0 || index === TIERS.length - 1) {
    return null;
  }

  return TIERS[index + 1];
}

function getTierProgress(points: number, currentTierName: string): number {
  const current = getTierForPoints(points);
  const next = getNextTier(currentTierName);

  if (!next) {
    return 100;
  }

  const span = next.minPoints - current.minPoints;
  if (span <= 0) {
    return 100;
  }

  const progress = ((points - current.minPoints) / span) * 100;
  return Math.max(0, Math.min(100, Math.round(progress)));
}

function getWeekStartIso(now: Date): string {
  const weekStart = new Date(now);
  const day = weekStart.getUTCDay();
  const daysSinceMonday = (day + 6) % 7;
  weekStart.setUTCHours(0, 0, 0, 0);
  weekStart.setUTCDate(weekStart.getUTCDate() - daysSinceMonday);
  return weekStart.toISOString();
}

async function getUser(userId: string): Promise<UserRow | null> {
  const cacheKey = `dashboard:user:${userId}`;
  const cachedUser = await cacheGet<UserRow>(cacheKey);

  if (cachedUser) {
    return cachedUser;
  }

  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (user) {
    await cacheSet(cacheKey, user, 300);
  }

  return user;
}

async function getReceiptStats(
  userId: string,
): Promise<{ receiptsUploaded: number; weeklyUploads: number }> {
  const weekStartIso = getWeekStartIso(new Date());

  const [allReceiptsResult, weeklyReceiptsResult] = await Promise.all([
    supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    supabase
      .from("receipts")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", weekStartIso),
  ]);

  if (allReceiptsResult.error) {
    throw allReceiptsResult.error;
  }

  if (weeklyReceiptsResult.error) {
    throw weeklyReceiptsResult.error;
  }

  return {
    receiptsUploaded: allReceiptsResult.count ?? 0,
    weeklyUploads: weeklyReceiptsResult.count ?? 0,
  };
}

function resolveDashboardTier(user: UserRow): {
  tier: string;
  nextTier: string | null;
  tierProgress: number;
} {
  const points = getPoints(user);
  const tier = user.tier ?? getTierForPoints(points).name;
  const nextTier = getNextTier(tier)?.name ?? null;

  return {
    tier,
    nextTier,
    tierProgress: getTierProgress(points, tier),
  };
}

function compareDashboardPriceRows(
  left: Database["public"]["Tables"]["prices"]["Row"],
  right: Database["public"]["Tables"]["prices"]["Row"],
): number {
  const leftSynthetic = left.is_synthetic === true ? 1 : 0;
  const rightSynthetic = right.is_synthetic === true ? 1 : 0;

  if (leftSynthetic !== rightSynthetic) {
    return leftSynthetic - rightSynthetic;
  }

  const leftDate = left.date_recorded ?? "";
  const rightDate = right.date_recorded ?? "";

  if (leftDate !== rightDate) {
    return rightDate.localeCompare(leftDate);
  }

  return left.price - right.price;
}

export async function getDashboard(userId: string): Promise<DashboardSummary> {
  const user = await getUser(userId);

  if (!user) {
    throw new DashboardNotFoundError("User not found");
  }

  const receiptStats = await getReceiptStats(userId);
  const tierSummary = resolveDashboardTier(user);

  return {
    id: user.id,
    display_name: user.display_name ?? "Anonymous",
    points: getPoints(user),
    tier: tierSummary.tier,
    next_tier: tierSummary.nextTier,
    tier_progress: tierSummary.tierProgress,
    streak_days: user.streak_days ?? 0,
    receipts_uploaded: receiptStats.receiptsUploaded,
    weekly_uploads: receiptStats.weeklyUploads,
    weekly_upload_goal: WEEKLY_UPLOAD_GOAL,
    last_upload_at: user.last_upload_at,
    weekly_budget: user.weekly_budget,
    parish: user.parish,
  };
}

export async function getDashboardPrices(): Promise<DashboardPriceSummary[]> {
  const [prices, products, stores] = await Promise.all([
    getPrices(),
    getProducts(),
    getStores(),
  ]);

  const cheapestByProductId = new Map<number, DashboardPriceSummary>();

  for (const price of prices) {
    if (price.product_id == null || price.store_id == null) {
      continue;
    }

    const product = products.find((entry) => entry.id === price.product_id);
    const store = stores.find((entry) => entry.id === price.store_id);

    if (!product || !store) {
      continue;
    }

    const summary: DashboardPriceSummary = {
      product_id: product.id,
      name: product.canonical_name,
      category: product.category,
      cheapest_price: price.price,
      cheapest_store: store.name,
      unit_price: price.unit_price,
      unit_type: product.unit_type,
      confidence_score: price.confidence_score,
      date_recorded: price.date_recorded,
    };

    const existing = cheapestByProductId.get(product.id);
    if (!existing || summary.cheapest_price < existing.cheapest_price) {
      cheapestByProductId.set(product.id, summary);
    }
  }

  return [...cheapestByProductId.values()].sort((left, right) => {
    if (left.cheapest_price !== right.cheapest_price) {
      return left.cheapest_price - right.cheapest_price;
    }

    return left.name.localeCompare(right.name);
  });
}

export async function getDashboardStores() {
  const stores = await getStores();

  return stores
    .filter(
      (store) => store.latitude != null && store.longitude != null,
    )
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function getStorePrices(
  storeIdOrIdentifier: string,
  _optionalName?: string,
): Promise<DashboardStorePrice[]> {
  const numericStoreId = Number(storeIdOrIdentifier);

  if (!Number.isInteger(numericStoreId)) {
    throw new DashboardNotFoundError("Store not found");
  }

  const [stores, prices, products] = await Promise.all([
    getStores(),
    getPrices(),
    getProducts(),
  ]);

  const store = stores.find((entry) => entry.id === numericStoreId);
  if (!store) {
    throw new DashboardNotFoundError("Store not found");
  }

  const preferredPrices = new Map<number, Database["public"]["Tables"]["prices"]["Row"]>();

  for (const price of prices) {
    if (price.store_id !== store.id || price.product_id == null) {
      continue;
    }

    const current = preferredPrices.get(price.product_id);
    if (!current || compareDashboardPriceRows(price, current) < 0) {
      preferredPrices.set(price.product_id, price);
    }
  }

  return [...preferredPrices.entries()]
    .map(([productId, price]) => {
      const product = products.find((entry) => entry.id === productId);

      if (!product) {
        return null;
      }

      return {
        product_id: product.id,
        name: product.canonical_name,
        category: product.category,
        unit_type: product.unit_type,
        price: price.price,
        unit_price: price.unit_price,
        confidence_score: price.confidence_score,
        date_recorded: price.date_recorded,
      };
    })
    .filter((entry): entry is DashboardStorePrice => entry != null)
    .sort((left, right) => left.name.localeCompare(right.name));
}
