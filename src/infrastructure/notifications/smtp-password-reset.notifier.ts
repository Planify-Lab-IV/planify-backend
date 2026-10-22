import type { Transporter } from "nodemailer";
import type { PasswordResetNotifier } from "./password-reset.notifier.js";

export interface SmtpPasswordResetNotifierOptions {
  transporter: Pick<Transporter, "sendMail">;
  from: string;
}

export function createSmtpPasswordResetNotifier({
  transporter,
  from,
}: SmtpPasswordResetNotifierOptions): PasswordResetNotifier {
  return {
    sendResetCode({ email, code }): Promise<void> {
      const text = [
        "Tu código para restablecer la contraseña de Planify es:",
        "",
        code,
        "",
        "Este código vence en 30 minutos.",
        "Si no pediste este código, ignorá este mail. Tu contraseña no cambió.",
      ].join("\n");
      const html = [
        "<p>Tu código para restablecer la contraseña de Planify es:</p>",
        `<p><strong style="font-size: 24px; letter-spacing: 4px;">${code}</strong></p>`,
        "<p>Este código vence en 30 minutos.</p>",
        "<p>Si no pediste este código, ignorá este mail. Tu contraseña no cambió.</p>",
      ].join("");

      void transporter
        .sendMail({
          from,
          to: email,
          subject: "Tu código para restablecer la contraseña de Planify",
          text,
          html,
        })
        .catch(() => {
          console.error("No se pudo enviar el correo de recuperación");
        });

      return Promise.resolve();
    },
  };
}
