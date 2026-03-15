import { Router } from "express";
import { z } from "zod";
import { cacheGet, cacheSet } from "../lib/cache.js";
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

function buildSearchCacheKey(body: SearchRequestBody): string {
  const terms = body.terms.join(",");
  const savingsMode = body.savingsMode ?? 2;
  const userLat = body.userLat ?? "null";
  const userLng = body.userLng ?? "null";

  return `search:${terms}:${savingsMode}:${userLat}:${userLng}`;
}

router.get("/products", async (req, res, next) => {
  try {
    const query = productsQuerySchema.parse(req.query);
    const cacheKey = `products:${query.limit}:${query.category ?? "all"}`;
    const cachedProducts = await cacheGet<unknown[]>(cacheKey);
    const cacheHit = Boolean(cachedProducts);
    const ttlSeconds = 300;

    let data = cachedProducts ?? [];

    if (!cachedProducts) {
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

      data = products ?? [];
      await cacheSet(cacheKey, data, ttlSeconds);
    }

    res.status(200).json({
      ok: true,
      cache: {
        hit: cacheHit,
        ttlSeconds,
        provider: "upstash",
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
    const cacheKey = buildSearchCacheKey(body);
    const cached = await cacheGet<SearchResult[]>(cacheKey);

    if (cached) {
      res.status(200).json(cached);

      logInfo("Search completed", {
        termCount: body.terms.length,
        terms: body.terms,
        savingsMode: body.savingsMode ?? 2,
        userLat: body.userLat ?? null,
        userLng: body.userLng ?? null,
        cacheHit: true,
        cacheTtlSeconds: 120,
        cacheProvider: "upstash",
        resultCount: cached.length,
      });
      return;
    }

    const data = await performSearch(body);

    await cacheSet(cacheKey, data, 120);

    res.status(200).json(data);

    logInfo("Search completed", {
      termCount: body.terms.length,
      terms: body.terms,
      savingsMode: body.savingsMode ?? 2,
      userLat: body.userLat ?? null,
      userLng: body.userLng ?? null,
      cacheHit: false,
      cacheTtlSeconds: 120,
      cacheProvider: "upstash",
      resultCount: data.length,
    });
  } catch (error) {
    next(error);
  }
});

export default router;
