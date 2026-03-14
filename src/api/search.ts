import { Router } from "express";
import { z } from "zod";
import { withCache } from "../db/cache.js";
import { isRedisReady } from "../db/redis.js";
import { supabase } from "../db/supabase-client.js";
import { logInfo } from "../utils/logger.js";

const router = Router();

const productsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  category: z.string().trim().min(1).optional(),
});

router.get("/products", async (req, res, next) => {
  try {
    const query = productsQuerySchema.parse(req.query);
    const { data, cacheHit, ttlSeconds } = await withCache(
      "products",
      query,
      async () => {
        let supabaseQuery = supabase
          .from("products")
          .select("*")
          .order("id", { ascending: true })
          .limit(query.limit);

        if (query.category) {
          supabaseQuery = supabaseQuery.eq("category", query.category);
        }

        const { data: products, error } = await supabaseQuery;

        if (error) {
          throw error;
        }

        return products ?? [];
      },
    );

    res.status(200).json({
      ok: true,
      cache: {
        hit: cacheHit,
        ttlSeconds,
        provider: isRedisReady() ? "redis" : "none",
      },
      data,
    });

    logInfo("Products fetched", {
      limit: query.limit,
      category: query.category ?? null,
      cacheHit,
      itemCount: data.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
