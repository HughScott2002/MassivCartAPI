import { Router } from "express";
import { z } from "zod";
import { withCache } from "../db/cache.js";
import { isRedisReady } from "../db/redis.js";
import { supabase } from "../db/supabase-client.js";
import { performSearch } from "../services/search-service.js";
import type { SearchRequestBody, SearchResult } from "../types/api.types.js";
import { logInfo } from "../utils/logger.js";

const router = Router();

const productsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  category: z.string().trim().min(1).optional(),
});

const searchBodySchema = z.object({
  terms: z.array(z.string().trim().min(1)).min(1),
  savingsMode: z.coerce.number().int().min(0).max(3).optional(),
  userLat: z.coerce.number().min(-90).max(90).optional(),
  userLng: z.coerce.number().min(-180).max(180).optional(),
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

router.post("/api/search", async (req, res, next) => {
  try {
    const body = searchBodySchema.parse(req.body) as SearchRequestBody;
    const { data, cacheHit, ttlSeconds } = await withCache<SearchResult[]>(
      "search",
      {
        terms: body.terms,
        savingsMode: body.savingsMode ?? 2,
        userLat: body.userLat ?? null,
        userLng: body.userLng ?? null,
      },
      async () => performSearch(body),
    );

    res.status(200).json(data);

    logInfo("Search completed", {
      termCount: body.terms.length,
      terms: body.terms,
      savingsMode: body.savingsMode ?? 2,
      userLat: body.userLat ?? null,
      userLng: body.userLng ?? null,
      cacheHit,
      cacheTtlSeconds: ttlSeconds,
      cacheProvider: isRedisReady() ? "redis" : "none",
      resultCount: data.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
