import { Router } from "express";
import { z } from "zod";
import { getProducts } from "../db/data-access.js";
import { supabase, supabaseAdmin } from "../db/supabase-client.js";
import { cacheDelete, cacheGet, cacheSet } from "../lib/cache.js";
import { getProvider } from "../llm/registry.js";
import { makeCommandRunner } from "../llm/prompts.js";
import { performSearch } from "../services/search-service.js";
import { logError, logInfo } from "../utils/logger.js";
import type { CommandAction } from "../llm/types.js";

const router = Router();
const runCommand = makeCommandRunner(getProvider());

const commandBodySchema = z.object({
  message: z.string().trim().min(1),
  intent: z.string().trim().min(1).default("find"),
  budget: z.string().trim().optional(),
  userId: z.string().trim().optional(),
  savingsMode: z.coerce.number().int().min(0).max(3).optional(),
  userLat: z.coerce.number().min(-90).max(90).optional(),
  userLng: z.coerce.number().min(-180).max(180).optional(),
});

async function persistBudget(budget: number | null, userId?: string): Promise<void> {
  if (budget == null || !userId) {
    return;
  }

  const client = supabaseAdmin ?? supabase;
  const { error } = await client
    .from("users")
    .update({ weekly_budget: budget })
    .eq("id", userId);

  if (error) {
    throw error;
  }

  await cacheDelete(`user:${userId}`);
}

router.post("/api/command", async (req, res) => {
  const body = commandBodySchema.parse(req.body);

  try {
    const cacheKey = [
      "nlp-command",
      body.intent,
      body.message.trim(),
      body.budget ?? "",
    ].join(":");
    let action = await cacheGet<CommandAction>(cacheKey);

    if (!action) {
      const products = await getProducts();
      action = await runCommand(
        body.message,
        {
          intent: body.intent,
          budget: body.budget ?? "",
        },
        products,
      );
      await cacheSet(cacheKey, action, 300);
    }

    await persistBudget(action.budget, body.userId);

    const searchTerms =
      action.search_terms?.length
        ? action.search_terms
        : body.intent === "find" &&
            action.budget == null &&
            action.savings_mode == null
          ? [body.message]
          : [];

    const effectiveSavingsMode = action.savings_mode ?? body.savingsMode;
    const results =
      searchTerms.length > 0
        ? await performSearch({
            terms: searchTerms,
            savingsMode: effectiveSavingsMode,
            userLat: body.userLat,
            userLng: body.userLng,
          })
        : [];

    const response = {
      ...action,
      text:
        action.search_terms?.length || results.length === 0
          ? action.text
          : `Searching for "${body.message}"...`,
      results,
    };

    logInfo("Command completed", {
      intent: body.intent,
      message: body.message,
      savingsMode: effectiveSavingsMode ?? null,
      resultCount: results.length,
      searchTerms,
      userId: body.userId ?? null,
    });

    res.status(200).json(response);
  } catch (error) {
    logError("Command handling failed", error, {
      path: "/api/command",
    });

    res.status(502).json({
      action: "error",
      text: "Command service unavailable.",
      results: [],
    });
  }
});

export default router;
