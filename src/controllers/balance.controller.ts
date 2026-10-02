import type { NextFunction, Request, Response } from "express";
import {
  toBalanceResponseDTO,
  toPersonBalanceDetailResponseDTO,
  toPersonBalanceResponseDTO,
  toPersonDebtSettlementResponseDTO,
} from "../dtos/balance/balance.response.dto.js";
import type { DebtService } from "../services/debt.service.js";
import { UnauthorizedError, ValidationError } from "../shared/errors/index.js";
import { getAuthenticatedUserId } from "../shared/request.helpers.js";

export interface BalanceController {
  getSummary(req: Request, res: Response, next: NextFunction): Promise<void>;
  getPeople(req: Request, res: Response, next: NextFunction): Promise<void>;
  getPersonDetail(req: Request, res: Response, next: NextFunction): Promise<void>;
  settleWithPerson(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createBalanceController(debtService: DebtService): BalanceController {
  return {
    async getSummary(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = getAuthenticatedUserId(req);
        const summary = await debtService.getBalanceSummary(userId);
        res.status(200).json(toBalanceResponseDTO(summary));
      } catch (error) {
        next(error);
      }
    },

    async getPeople(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = req.userId;

        if (!userId) {
          throw new UnauthorizedError("User is not authenticated");
        }

        const balances = await debtService.getPeopleBalances(userId);
        res.status(200).json(balances.map(toPersonBalanceResponseDTO));
      } catch (error) {
        next(error);
      }
    },

    async getPersonDetail(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = req.userId;

        if (!userId) {
          throw new UnauthorizedError("User is not authenticated");
        }

        const personKey = req.params.personKey;
        if (typeof personKey !== "string") {
          throw new ValidationError("La clave de persona es requerida");
        }

        const detail = await debtService.getPersonDetail(userId, personKey);
        res.status(200).json(toPersonBalanceDetailResponseDTO(detail));
      } catch (error) {
        next(error);
      }
    },

    async settleWithPerson(req: Request, res: Response, next: NextFunction): Promise<void> {
      try {
        const userId = getAuthenticatedUserId(req);
        const personKey = req.params.personKey;

        if (typeof personKey !== "string") {
          throw new ValidationError("La clave de persona es requerida");
        }

        const settlement = await debtService.settleWithPerson(userId, personKey);
        res.status(200).json(toPersonDebtSettlementResponseDTO(settlement));
      } catch (error) {
        next(error);
      }
    },
  };
}
