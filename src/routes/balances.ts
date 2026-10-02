import { Router } from "express";
import { createBalanceController } from "../controllers/balance.controller.js";
import { createSessionTokenService } from "../infrastructure/security/session.token.service.js";
import { debtRepository } from "../repositories/debt.repository.js";
import { eventRepository } from "../repositories/event.repository.js";
import { expenseRepository } from "../repositories/expense.repository.js";
import { createDebtService } from "../services/debt.service.js";
import { env } from "../shared/config/env.js";
import { createAuthMiddleware } from "../shared/middlewares/auth.middleware.js";

const router = Router();

const sessionTokenService = createSessionTokenService(env.JWT_SECRET);
const requireAuthenticatedUser = createAuthMiddleware(sessionTokenService);

const debtService = createDebtService(expenseRepository, debtRepository, eventRepository);
const balanceController = createBalanceController(debtService);

router.get("/me/balance/people", requireAuthenticatedUser, (req, res, next) =>
  balanceController.getPeople(req, res, next),
);

router.post("/me/balance/people/:personKey/settle", requireAuthenticatedUser, (req, res, next) =>
  balanceController.settleWithPerson(req, res, next),
);

router.get("/me/balance/people/:personKey", requireAuthenticatedUser, (req, res, next) =>
  balanceController.getPersonDetail(req, res, next),
);

router.get("/me/balance", requireAuthenticatedUser, (req, res, next) =>
  balanceController.getSummary(req, res, next),
);

export default router;
