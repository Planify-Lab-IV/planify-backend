import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createFcmPushNotifier,
  type FcmMessaging,
} from "../src/infrastructure/notifications/fcm.push.notifier.js";

describe("FCM push notifier", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("envía el payload requerido y devuelve únicamente tokens inválidos", async () => {
    const messaging: FcmMessaging = {
      sendEachForMulticast: vi.fn(async () => ({
        responses: [
          { success: true },
          { success: false, error: { code: "messaging/invalid-registration-token" } },
          { success: false, error: { code: "messaging/internal-error" } },
        ],
      })),
    };
    const notifier = createFcmPushNotifier({ messaging });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      notifier.send(["valid", "invalid", "retry"], {
        title: "Asado",
        body: "Marta agregó una tarea.",
        eventId: "event-1",
        activityType: "task_created",
      }),
    ).resolves.toEqual({ invalidTokens: ["invalid"] });

    expect(messaging.sendEachForMulticast).toHaveBeenCalledWith({
      tokens: ["valid", "invalid", "retry"],
      notification: { title: "Asado", body: "Marta agregó una tarea." },
      data: { eventId: "event-1", activityType: "task_created" },
      android: { priority: "high" },
    });
    expect(consoleError).toHaveBeenCalledWith(
      "No se pudo enviar una notificación push",
      "messaging/internal-error",
    );
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("retry");
  });

  it("divide los envíos en lotes de hasta 500 tokens", async () => {
    const messaging: FcmMessaging = {
      sendEachForMulticast: vi.fn(async ({ tokens }) => ({
        responses: tokens.map(() => ({ success: true })),
      })),
    };
    const notifier = createFcmPushNotifier({ messaging });
    const tokens = Array.from({ length: 501 }, (_, index) => `token-${index}`);

    await notifier.send(tokens, {
      title: "Asado",
      body: "Horario confirmado",
      eventId: "event-1",
      activityType: "schedule_confirmed",
    });

    expect(messaging.sendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(vi.mocked(messaging.sendEachForMulticast).mock.calls[0]?.[0].tokens).toHaveLength(500);
    expect(vi.mocked(messaging.sendEachForMulticast).mock.calls[1]?.[0].tokens).toEqual([
      "token-500",
    ]);
  });

  it("continúa con los siguientes lotes cuando uno falla", async () => {
    const sendEachForMulticast = vi
      .fn<FcmMessaging["sendEachForMulticast"]>()
      .mockRejectedValueOnce({ code: "messaging/internal-error" })
      .mockResolvedValueOnce({
        responses: [{ success: false, error: { code: "messaging/invalid-registration-token" } }],
      });
    const messaging: FcmMessaging = { sendEachForMulticast };
    const notifier = createFcmPushNotifier({ messaging });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const tokens = Array.from({ length: 501 }, (_, index) => `token-${index}`);

    await expect(
      notifier.send(tokens, {
        title: "Asado",
        body: "Horario confirmado",
        eventId: "event-1",
        activityType: "schedule_confirmed",
      }),
    ).resolves.toEqual({ invalidTokens: ["token-500"] });

    expect(sendEachForMulticast).toHaveBeenCalledTimes(2);
    expect(sendEachForMulticast.mock.calls[1]?.[0].tokens).toEqual(["token-500"]);
    expect(consoleError).toHaveBeenCalledWith(
      "No se pudo enviar un lote de notificaciones push",
      "messaging/internal-error",
    );
  });
});
