import type { Request, Response, NextFunction } from "express";
import { logWarn } from "../utils/logger.js";

export function adminGuard(req: Request, res: Response, next: NextFunction): void {
  const secret = process.env.PLACES_SYNC_SECRET;

  if (!secret) {
    logWarn("PLACES_SYNC_SECRET not configured — admin route blocked", {
      path: req.originalUrl,
    });
    res.status(503).json({ ok: false, error: "Admin routes not configured" });
    return;
  }

  const provided = req.headers["x-admin-secret"];
  if (provided !== secret) {
    logWarn("Admin auth failed", {
      path: req.originalUrl,
      hasHeader: Boolean(provided),
    });
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  next();
}
