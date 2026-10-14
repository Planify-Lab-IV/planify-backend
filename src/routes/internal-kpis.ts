import { Router } from "express";
import { createKpiController } from "../controllers/kpi.controller.js";
import { httpMetricsRepository } from "../repositories/http-metrics.repository.js";
import { kpiRepository } from "../repositories/kpi.repository.js";
import { createKpiService } from "../services/kpi.service.js";
import { env } from "../shared/config/env.js";
import { createInternalKpisAuthMiddleware } from "../shared/middlewares/internal-kpis-auth.middleware.js";

const router = Router();

const requireInternalKpisToken = createInternalKpisAuthMiddleware(env.INTERNAL_KPIS_TOKEN);
const kpiService = createKpiService(kpiRepository, httpMetricsRepository);
const kpiController = createKpiController(kpiService);

router.get("/internal/kpis", requireInternalKpisToken, (req, res, next) =>
  kpiController.getInternalKpis(req, res, next),
);

export default router;
