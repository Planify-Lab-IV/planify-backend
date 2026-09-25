import type { NextFunction, Request, Response } from "express";
import { toExpenseResponseDTO } from "../dtos/expense/expense.response.dto.js";
import type { ExpenseService } from "../services/expense.service.js";
import { UnauthorizedError, ValidationError } from "../shared/errors/index.js";
import { validateCreateExpenseDTO } from "../validators/expense/create.expense.validator.js";

export interface ExpenseController {
  create(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createExpenseController(expenseService: ExpenseService): ExpenseController {
  return {
    async create(req, res, next) {
      try {
        const eventId = req.params.eventId;

        if (typeof eventId !== "string" || eventId.trim() === "") {
          throw new ValidationError("El eventId es requerido");
        }

        const actor = req.attendanceActor;
        if (!actor) {
          throw new UnauthorizedError("Usuario no autenticado");
        }

        const dto = validateCreateExpenseDTO(req.body);
        const expense = await expenseService.createExpense(eventId, actor, dto);

        res.status(201).json(toExpenseResponseDTO(expense));
      } catch (error) {
        next(error);
      }
    },
  };
}
