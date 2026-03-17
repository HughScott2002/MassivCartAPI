import { Router } from "express";
import { z } from "zod";
import { adminGuard } from "../middleware/admin-guard.js";
import { runSyntheticSeed } from "../db/synthetic-store.js";
import { logError, logInfo } from "../utils/logger.js";

const router = Router();

const seedBodySchema = z.object({
  parish: z.string().trim().min(1).default("Kingston"),
});

router.post("/api/admin/synthetic-seed", adminGuard, async (req, res) => {
  try {
    const { parish } = seedBodySchema.parse(req.body);

    logInfo("Synthetic seed request received", { parish });

    const result = await runSyntheticSeed(parish);

    res.json({ ok: true, ...result });
  } catch (error) {
    logError("Synthetic seed failed", error, {
      path: "/api/admin/synthetic-seed",
    });
    const message =
      error instanceof Error ? error.message : "Synthetic seed failed";
    res.status(500).json({ ok: false, error: message });
  }
});

export default router;
