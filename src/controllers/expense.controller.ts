import type { NextFunction, Request, Response } from "express";
import { toExpenseResponseDTO } from "../dtos/expense/expense.response.dto.js";
import type { ExpenseService } from "../services/expense.service.js";
import { getAttendanceActor, getEventId } from "../shared/request.helpers.js";
import { validateCreateExpenseDTO } from "../validators/expense/create.expense.validator.js";

export interface ExpenseController {
  create(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createExpenseController(expenseService: ExpenseService): ExpenseController {
  return {
    async create(req, res, next) {
      try {
        const eventId = getEventId(req);
        const actor = getAttendanceActor(req);

        const dto = validateCreateExpenseDTO(req.body);
        const expense = await expenseService.createExpense(eventId, actor, dto);

        res.status(201).json(toExpenseResponseDTO(expense));
      } catch (error) {
        next(error);
      }
    },
  };
}
