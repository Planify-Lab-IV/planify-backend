export interface PasswordResetNotifier {
  sendResetCode(data: { email: string; code: string }): Promise<void>;
}

export function createConsolePasswordResetNotifier(nodeEnv: string): PasswordResetNotifier {
  return {
    async sendResetCode({ email, code }): Promise<void> {
      if (nodeEnv === "development" || nodeEnv === "test") {
        console.log(`Código de recuperación para ${email}: ${code}`);
        return;
      }

      console.log("Se solicitó una recuperación de contraseña");
    },
  };
}
