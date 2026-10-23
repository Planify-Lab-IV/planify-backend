import { describe, expect, it, vi } from "vitest";
import type { Transporter } from "nodemailer";
import {
  createPasswordResetNotifier,
  type MailConfig,
} from "../src/infrastructure/notifications/password-reset-notifier.factory.js";

const smtpConfig: MailConfig = {
  NODE_ENV: "test",
  MAIL_TRANSPORT: "smtp",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: 465,
  SMTP_USER: "planify",
  SMTP_PASS: "app-password",
  MAIL_FROM: "Planify <planify@example.com>",
};

describe("password reset notifier factory", () => {
  it("configura TLS directo para el puerto 465", () => {
    const transporter = { sendMail: vi.fn(async () => undefined) } as unknown as Pick<
      Transporter,
      "sendMail"
    >;
    const createTransport = vi.fn(() => transporter);

    createPasswordResetNotifier(smtpConfig, createTransport);

    expect(createTransport).toHaveBeenCalledWith({
      host: "smtp.example.com",
      port: 465,
      secure: true,
      auth: { user: "planify", pass: "app-password" },
    });
  });

  it("usa STARTTLS para el puerto 587", () => {
    const transporter = { sendMail: vi.fn(async () => undefined) } as unknown as Pick<
      Transporter,
      "sendMail"
    >;
    const createTransport = vi.fn(() => transporter);

    createPasswordResetNotifier({ ...smtpConfig, SMTP_PORT: 587 }, createTransport);

    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false }));
  });

  it("mantiene la consola y advierte en producción sin SMTP", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const notifier = createPasswordResetNotifier({
      ...smtpConfig,
      NODE_ENV: "production",
      MAIL_TRANSPORT: undefined,
    });
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    await notifier.sendResetCode({ email: "ana@planify.dev", code: "123456" });

    expect(warn).toHaveBeenCalledWith(
      "La recuperación de contraseña no envía mails: falta configurar MAIL_TRANSPORT=smtp",
    );
    expect(log).toHaveBeenCalledWith(expect.not.stringContaining("123456"));
    warn.mockRestore();
    log.mockRestore();
  });
});
