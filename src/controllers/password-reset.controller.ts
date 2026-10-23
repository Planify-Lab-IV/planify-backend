import type { NextFunction, Request, Response } from "express";
import type { PasswordResetService } from "../services/password-reset.service.js";
import { validateForgotPasswordDTO } from "../validators/auth/forgot-password.validator.js";
import { validateResetPasswordDTO } from "../validators/auth/reset-password.validator.js";

export interface PasswordResetController {
  forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void>;
  resetPassword(req: Request, res: Response, next: NextFunction): Promise<void>;
}

export function createPasswordResetController(
  passwordResetService: PasswordResetService,
): PasswordResetController {
  return {
    async forgotPassword(req, res, next): Promise<void> {
      try {
        const dto = validateForgotPasswordDTO(req.body);
        await passwordResetService.requestReset(dto.email);
        res
          .status(200)
          .json({ message: "Si la cuenta existe, recibirá instrucciones de recuperación" });
      } catch (error) {
        next(error);
      }
    },

    async resetPassword(req, res, next): Promise<void> {
      try {
        const dto = validateResetPasswordDTO(req.body);
        await passwordResetService.resetPassword(dto.email, dto.code, dto.newPassword);
        res.status(204).send();
      } catch (error) {
        next(error);
      }
    },
  };
}
