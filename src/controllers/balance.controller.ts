import type { NextFunction, Request, Response } from "express";
import { toBalanceResponseDTO } from "../dtos/balance/balance.response.dto.js";
import type { DebtService } from "../services/debt.service.js";
import { UnauthorizedError } from "../shared/errors/index.js";

export interface BalanceController {
  getSummary(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createBalanceController(debtService: DebtService): BalanceController {
  return {
    async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = req.userId;

        if (!userId) {
          throw new UnauthorizedError("User is not authenticated");
        }

        const summary = await debtService.getBalanceSummary(userId);
        res.status(200).json(toBalanceResponseDTO(summary));
      } catch (error) {
        next(error);
      }
    },
  };
}
