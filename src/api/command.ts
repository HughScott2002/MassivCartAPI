import { Router } from "express";
import { z } from "zod";
import { cacheDelete, withCache } from "../db/cache.js";
import { supabase, supabaseAdmin } from "../db/supabase-client.js";
import { performSearch } from "../services/search-service.js";
import { logError, logInfo } from "../utils/logger.js";
import { commandQueue, commandQueueEvents } from "../queue/claude-queue.js";
import type { CommandAction } from "../llm/types.js";

const router = Router();

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
    const { data: action } = await withCache<CommandAction>(
      "nlp-command",
      { message: body.message, intent: body.intent, budget: body.budget },
      async () => {
        const job = await commandQueue.add("run-command", {
          message: body.message,
          intent: body.intent,
          budget: body.budget ?? "",
        });
        return job.waitUntilFinished(commandQueueEvents, 30_000);
      },
    );

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
