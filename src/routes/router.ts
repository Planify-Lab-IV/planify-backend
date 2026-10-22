// Punto único de entrada de todas las rutas de la aplicación

import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import eventsRouter from "./events.js";
import groupsRouter from "./groups.js";
import tasksRouter from "./tasks.js";
import balancesRouter from "./balances.js";
import activityLogRouter from "./activity-log.js";
import { createInternalKpisRouter } from "./internal-kpis.js";
import profileRouter from "./profile.js";
import notificationsRouter from "./notifications.js";
import friendsRouter from "./friends.js";
import { RouteNotFoundError } from "../shared/errors/index.js";
import type { HttpMetricsAccumulator } from "../services/http-metrics-accumulator.js";

export function createRouter(httpMetricsAccumulator: HttpMetricsAccumulator): Router {
  const router = Router();

  router.use(healthRouter);
  router.use(authRouter);
  router.use(eventsRouter);
  router.use(groupsRouter);
  router.use(tasksRouter);
  router.use(balancesRouter);
  router.use(activityLogRouter);
  router.use(profileRouter);
  router.use(notificationsRouter);
  router.use(friendsRouter);
  router.use(createInternalKpisRouter(httpMetricsAccumulator));

  // Handler 404 para cualquier ruta no mapeada
  router.use((_req, res, next) => {
    res.locals.isRouteNotFound = true;
    next(new RouteNotFoundError("Ruta no encontrada"));
  });

  return router;
}
