// Conecta todo y las vincula a una ruta HTTP

import { Router } from "express";
import { createHealthController } from "../controllers/health.controller.js";
import { createHealthService } from "../services/health.service.js";
import { healthRepository } from "../repositories/health.repository.js";

const router = Router();

const service = createHealthService(healthRepository);
const controller = createHealthController(service);

router.get("/health", (req, res, next) => controller.check(req, res, next));

export default router;
