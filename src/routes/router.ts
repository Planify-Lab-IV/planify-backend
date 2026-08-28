// Punto unica de entrada de todas las rutas que luego usa app

import { Router } from "express";
import healthRouter from "./health.js";
import { NotFoundError } from "../shared/errors/index.js";

const router = Router();

router.use(healthRouter);

router.use((_req, _res, next) => {
  next(new NotFoundError("Ruta no encontrada"));
});

export default router;
