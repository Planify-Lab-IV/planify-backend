import { describe, expect, it, vi } from "vitest";
import { createConsolePasswordResetNotifier } from "../src/infrastructure/notifications/password-reset.notifier.js";

describe("ConsolePasswordResetNotifier", () => {
  it("no revela el código en producción", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await createConsolePasswordResetNotifier("production").sendResetCode({
      email: "ana@planify.dev",
      code: "123456",
    });

    expect(log).toHaveBeenCalledWith(expect.not.stringContaining("123456"));
    log.mockRestore();
  });
});
