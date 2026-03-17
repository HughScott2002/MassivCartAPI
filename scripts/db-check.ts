import "dotenv/config";
import "../src/config/env.js";
import { supabase, supabaseAdmin } from "../src/db/supabase-client.js";

async function main() {
  const client = supabaseAdmin ?? supabase;

  const { count: productCount } = await client
    .from("products")
    .select("*", { count: "exact", head: true });

  const { count: syntheticCount } = await client
    .from("stores")
    .select("*", { count: "exact", head: true })
    .eq("is_synthetic", true);

  const { count: pricesCount } = await client
    .from("prices")
    .select("*", { count: "exact", head: true })
    .eq("is_synthetic", true);

  const { data: dupCheck } = await client
    .from("stores")
    .select("place_id")
    .eq("is_synthetic", true)
    .not("place_id", "is", null)
    .limit(5);

  console.log("products total:", productCount);
  console.log("synthetic stores total:", syntheticCount);
  console.log("synthetic prices total:", pricesCount);
  console.log("sample place_ids:", dupCheck?.map((s: { place_id: string | null }) => s.place_id));
}

main().catch(console.error);
