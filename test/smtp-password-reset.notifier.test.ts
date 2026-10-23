import { describe, expect, it, vi } from "vitest";
import type { SendMailOptions, Transporter } from "nodemailer";
import { createSmtpPasswordResetNotifier } from "../src/infrastructure/notifications/smtp-password-reset.notifier.js";

function makeTransporter(
  sendMail: (options: SendMailOptions) => Promise<unknown> = vi.fn(async () => undefined),
): Pick<Transporter, "sendMail"> {
  return { sendMail } as unknown as Pick<Transporter, "sendMail">;
}

describe("SmtpPasswordResetNotifier", () => {
  it("arma un correo con texto y HTML sin exponer el código en el asunto", async () => {
    const sendMail = vi.fn<(options: SendMailOptions) => Promise<unknown>>(async () => undefined);
    const notifier = createSmtpPasswordResetNotifier({
      transporter: makeTransporter(sendMail),
      from: "Planify <planify.notificaciones@gmail.com>",
    });

    await notifier.sendResetCode({ email: "ana@planify.dev", code: "123456" });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Planify <planify.notificaciones@gmail.com>",
        to: "ana@planify.dev",
        subject: expect.not.stringContaining("123456"),
        text: expect.stringContaining("123456"),
        html: expect.stringContaining("123456"),
      }),
    );
    const message = sendMail.mock.calls[0]?.[0];
    expect(message?.text).toContain("30 minutos");
    expect(message?.html).toContain("30 minutos");
    expect(message?.text).not.toContain("http");
    expect(message?.html).not.toContain("http");
  });

  it("resuelve sin esperar al servidor SMTP", async () => {
    const sendMail = vi.fn(() => new Promise<void>(() => undefined));
    const notifier = createSmtpPasswordResetNotifier({
      transporter: makeTransporter(sendMail),
      from: "Planify <planify.notificaciones@gmail.com>",
    });

    await expect(
      notifier.sendResetCode({ email: "ana@planify.dev", code: "123456" }),
    ).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("registra un fallo sin propagarlo ni revelar datos sensibles", async () => {
    const sendMail = vi.fn(async () => Promise.reject(new Error("SMTP unavailable")));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const notifier = createSmtpPasswordResetNotifier({
      transporter: makeTransporter(sendMail),
      from: "Planify <planify.notificaciones@gmail.com>",
    });

    await expect(
      notifier.sendResetCode({ email: "ana@planify.dev", code: "123456" }),
    ).resolves.toBeUndefined();
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(error).toHaveBeenCalledWith(expect.not.stringContaining("123456"));
    expect(error).toHaveBeenCalledWith(expect.not.stringContaining("ana@planify.dev"));
    error.mockRestore();
  });

  it("incluye el código de error de Nodemailer al registrar un fallo sin revelar datos sensibles", async () => {
    const sendMail = vi.fn(async () => {
      const error = Object.assign(
        new Error("Invalid login: 535-5.7.8 Username and Password not accepted"),
        { code: "EAUTH" },
      );
      return Promise.reject(error);
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const notifier = createSmtpPasswordResetNotifier({
      transporter: makeTransporter(sendMail),
      from: "Planify <planify.notificaciones@gmail.com>",
    });

    await expect(
      notifier.sendResetCode({ email: "ana@planify.dev", code: "123456" }),
    ).resolves.toBeUndefined();
    await vi.waitFor(() => expect(error).toHaveBeenCalledTimes(1));
    expect(error).toHaveBeenCalledWith(expect.stringContaining("EAUTH"));
    expect(error).toHaveBeenCalledWith(expect.not.stringContaining("123456"));
    expect(error).toHaveBeenCalledWith(expect.not.stringContaining("ana@planify.dev"));
    error.mockRestore();
  });
});
