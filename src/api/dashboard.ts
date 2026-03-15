import { Router } from "express";
import { cacheGet, cacheSet } from "../lib/cache.js";
import {
  DashboardNotFoundError,
  getDashboard,
  getDashboardPrices,
  getDashboardStores,
  getStorePrices,
} from "../services/dashboard-service.js";
import { logError, logInfo } from "../utils/logger.js";

const dashboardRouter = Router();

dashboardRouter.get("/api/dashboard", async (req, res) => {
  const userId =
    typeof req.query.userId === "string" ? req.query.userId.trim() : "";

  if (!userId) {
    res.status(400).json({ error: "userId required" });
    return;
  }

  try {
    const cacheKey = `dashboard:user:${userId}`;
    const cachedDashboard = await cacheGet<Awaited<ReturnType<typeof getDashboard>>>(
      cacheKey,
    );

    if (cachedDashboard) {
      res.status(200).json(cachedDashboard);
      return;
    }

    const dashboard = await getDashboard(userId);
    await cacheSet(cacheKey, dashboard, 300);
    res.status(200).json(dashboard);
  } catch (error) {
    if (error instanceof DashboardNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }

    logError("Dashboard lookup failed", error, {
      path: "/api/dashboard",
      userId,
    });

    res.status(500).json({ error: "Failed to fetch user" });
  }
});

dashboardRouter.get("/api/dashboard/prices", async (_req, res) => {
  try {
    const cacheKey = "dashboard:prices";
    const cachedPrices = await cacheGet<Awaited<ReturnType<typeof getDashboardPrices>>>(
      cacheKey,
    );

    if (cachedPrices) {
      res.status(200).json({ prices: cachedPrices });
      return;
    }

    const prices = await getDashboardPrices();
    await cacheSet(cacheKey, prices, 300);
    res.status(200).json({ prices });
  } catch (error) {
    logError("Dashboard price summary failed", error, {
      path: "/api/dashboard/prices",
    });

    res.status(500).json({ error: "Failed to fetch price summary" });
  }
});

dashboardRouter.get("/api/dashboard/stores", async (_req, res) => {
  try {
    const cacheKey = "dashboard:stores";
    const cachedStores = await cacheGet<Awaited<ReturnType<typeof getDashboardStores>>>(
      cacheKey,
    );

    if (cachedStores) {
      res.status(200).json({ stores: cachedStores });
      return;
    }

    const stores = await getDashboardStores();
    await cacheSet(cacheKey, stores, 600);
    res.status(200).json({ stores });
  } catch (error) {
    logError("Dashboard stores lookup failed", error, {
      path: "/api/dashboard/stores",
    });

    res.status(500).json({ error: "Failed to fetch stores" });
  }
});

dashboardRouter.get("/api/dashboard/stores/:storeId/prices", async (req, res) => {
  const storeId = req.params.storeId;
  const optionalName =
    typeof req.query.name === "string" ? req.query.name.trim() : undefined;

  try {
    const cacheKey = `store:prices:${storeId}`;
    const cachedProducts = await cacheGet<Awaited<ReturnType<typeof getStorePrices>>>(
      cacheKey,
    );

    if (cachedProducts) {
      res.status(200).json({ products: cachedProducts });
      return;
    }

    const products = await getStorePrices(storeId, optionalName);
    await cacheSet(cacheKey, products, 300);

    if (products.length === 0) {
      logInfo("Store prices returned no products", {
        path: "/api/dashboard/stores/:storeId/prices",
        storeId,
      });
    }

    res.status(200).json({ products });
  } catch (error) {
    if (error instanceof DashboardNotFoundError) {
      res.status(404).json({ error: error.message });
      return;
    }

    logError("Store prices lookup failed", error, {
      path: "/api/dashboard/stores/:storeId/prices",
      storeId,
      optionalName: optionalName ?? null,
    });

    res.status(500).json({ error: "Failed to fetch store prices" });
  }
});

export default dashboardRouter;
