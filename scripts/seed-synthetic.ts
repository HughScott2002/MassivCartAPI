/**
 * Standalone synthetic data seeder.
 * Run with: npx tsx scripts/seed-synthetic.ts [parish]
 * Default parish: Kingston
 *
 * Prerequisites:
 *   1. Copy MassivCartUI/data/stores-cache.json to MassivCartAPI/data/stores-cache.json
 *      (or run the places-sync script first)
 *   2. Seed the products table in Supabase
 *   3. Set SUPABASE_URL, SUPABASE_ANON_KEY, ANTHROPIC_API_KEY in .env
 *      (SUPABASE_SERVICE_ROLE_KEY recommended to bypass RLS)
 */
import "dotenv/config";
import "../src/config/env.js";
import { runSyntheticSeed } from "../src/db/synthetic-store.js";
import { logInfo, logError } from "../src/utils/logger.js";

const parish = process.argv[2] ?? "Kingston";

logInfo("Starting synthetic seed", { parish });

runSyntheticSeed(parish)
  .then(({ seededStores, seededPrices }) => {
    logInfo("Seed complete", { parish, seededStores, seededPrices });
    // eslint-disable-next-line n/no-process-exit
    process.exit(0);
  })
  .catch((err: unknown) => {
    logError("Seed failed", err);
    // eslint-disable-next-line n/no-process-exit
    process.exit(1);
  });
