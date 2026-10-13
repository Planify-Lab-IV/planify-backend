import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { UnauthorizedError } from "../errors/index.js";

export function createInternalKpisAuthMiddleware(
  internalKpisToken: string | undefined,
): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const receivedToken = req.get("X-Internal-Token");

    if (!internalKpisToken || !receivedToken || !tokensMatch(receivedToken, internalKpisToken)) {
      next(new UnauthorizedError("Token interno inválido o ausente"));
      return;
    }

    next();
  };
}

function tokensMatch(receivedToken: string, configuredToken: string): boolean {
  const receivedBuffer = Buffer.from(receivedToken);
  const configuredBuffer = Buffer.from(configuredToken);

  return (
    receivedBuffer.length === configuredBuffer.length &&
    timingSafeEqual(receivedBuffer, configuredBuffer)
  );
}
