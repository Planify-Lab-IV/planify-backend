// Recibe un error, si lo encuentra entre los errores centralizados o 500 por default

import type { Request, Response } from "express";
import { AppError } from "../errors/index.js";

export function errorHandler(err: Error, _req: Request, res: Response): void {
  console.error(`[Error] ${err.name}: ${err.message}`);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
    });
    return;
  }

  res.status(500).json({
    error: "InternalServerError",
    message: "Error interno del servidor",
  });
}
