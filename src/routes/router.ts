// Punto único de entrada de todas las rutas de la aplicación

import { Router } from "express";
import healthRouter from "./health.js";
import authRouter from "./auth.js";
import { NotFoundError } from "../shared/errors/index.js";

const router = Router();

router.use(healthRouter);
router.use(authRouter);

// Handler 404 para cualquier ruta no mapeada
router.use((_req, _res, next) => {
  next(new NotFoundError("Ruta no encontrada"));
});

export default router;
