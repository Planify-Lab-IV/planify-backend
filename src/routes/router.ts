// Punto único de entrada de todas las rutas de la aplicación

import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import eventsRouter from "./events.js";
import groupsRouter from "./groups.js";
import { RouteNotFoundError } from "../shared/errors/index.js";

const router = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(eventsRouter);
router.use(groupsRouter);

// Handler 404 para cualquier ruta no mapeada
router.use((_req, _res, next) => {
  next(new RouteNotFoundError("Ruta no encontrada"));
});

export default router;
