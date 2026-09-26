import type { NextFunction, Request, Response } from "express";
import { toEventDebtsResponseDTO } from "../dtos/debt/debt.response.dto.js";
import type { DebtService } from "../services/debt.service.js";
import { getAttendanceActor, getEventId } from "../shared/request.helpers.js";

export interface DebtController {
  listEventDebts(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createDebtController(debtService: DebtService): DebtController {
  return {
    async listEventDebts(req, res, next) {
      try {
        const eventId = getEventId(req);
        const actor = getAttendanceActor(req);

        const { debts, allSettled } = await debtService.listEventDebts(eventId, actor);
        res.status(200).json(toEventDebtsResponseDTO(debts, allSettled));
      } catch (error) {
        next(error);
      }
    },
  };
}
