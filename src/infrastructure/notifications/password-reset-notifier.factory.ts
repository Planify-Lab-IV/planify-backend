import nodemailer, { type Transporter } from "nodemailer";
import type { Env } from "../../shared/config/env.js";
import {
  createConsolePasswordResetNotifier,
  type PasswordResetNotifier,
} from "./password-reset.notifier.js";
import { createSmtpPasswordResetNotifier } from "./smtp-password-reset.notifier.js";

type MailConfig = Pick<
  Env,
  | "NODE_ENV"
  | "MAIL_TRANSPORT"
  | "SMTP_HOST"
  | "SMTP_PORT"
  | "SMTP_USER"
  | "SMTP_PASS"
  | "MAIL_FROM"
>;

type CreateTransport = (options: {
  host: string;
  port: number;
  secure: boolean;
  auth: { user: string; pass: string };
}) => Pick<Transporter, "sendMail">;

export function createPasswordResetNotifier(
  config: MailConfig,
  createTransport: CreateTransport = nodemailer.createTransport,
): PasswordResetNotifier {
  if (config.MAIL_TRANSPORT === "smtp") {
    return createSmtpPasswordResetNotifier({
      transporter: createTransport({
        host: config.SMTP_HOST,
        port: config.SMTP_PORT,
        secure: config.SMTP_PORT === 465,
        auth: { user: config.SMTP_USER!, pass: config.SMTP_PASS! },
      }),
      from: config.MAIL_FROM!,
    });
  }

  if (config.NODE_ENV === "production") {
    console.warn(
      "La recuperación de contraseña no envía mails: falta configurar MAIL_TRANSPORT=smtp",
    );
  }

  return createConsolePasswordResetNotifier(config.NODE_ENV);
}
