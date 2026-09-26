import type { NextFunction, Request, Response } from "express";
import { toEventDebtsResponseDTO } from "../dtos/debt/debt.response.dto.js";
import type { DebtService } from "../services/debt.service.js";
import { UnauthorizedError, ValidationError } from "../shared/errors/index.js";

export interface DebtController {
  listEventDebts(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createDebtController(debtService: DebtService): DebtController {
  return {
    async listEventDebts(req, res, next) {
      try {
        const eventId = req.params.eventId;
        if (typeof eventId !== "string" || eventId.trim() === "") {
          throw new ValidationError("El eventId es requerido");
        }

        const actor = req.attendanceActor;
        if (!actor) {
          throw new UnauthorizedError("Usuario no autenticado");
        }

        const { debts, allSettled } = await debtService.listEventDebts(eventId, actor);
        res.status(200).json(toEventDebtsResponseDTO(debts, allSettled));
      } catch (error) {
        next(error);
      }
    },
  };
}
