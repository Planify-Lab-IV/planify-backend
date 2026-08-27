// Recibe un error, si lo encuentra entre los errores centralizados o 500 por default

import type { Request, Response } from "express";
import { AppError } from "../errors/index.js";
import type { NextFunction } from "express";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  console.error(`[Error] ${err.name}: ${err.message}`);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.name,
      message: err.message,
    });
    return;
  }

  if (err.type === "entity.parse.failed") {
    res.status(400).json({
      error: "INVALID_JSON",
      message: "El body de la request no es JSON válido",
    });
    return;
  }

  res.status(500).json({
    error: "InternalServerError",
    message: "Error interno del servidor",
  });
}
