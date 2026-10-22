import { describe, expect, it, vi } from "vitest";
import type { PushNotifier } from "../src/infrastructure/notifications/push.notifier.js";
import type { EventRepository } from "../src/repositories/event.repository.js";
import type { ParticipantRepository } from "../src/repositories/participant.repository.js";
import type { PushDeviceRepository } from "../src/repositories/push-device.repository.js";
import {
  buildActivityPushMessage,
  createNotificationService,
} from "../src/services/notification.service.js";

function createSetup({ tokens = ["token-2"] }: { tokens?: string[] } = {}) {
  const devices: PushDeviceRepository = {
    upsertByToken: vi.fn(async () => undefined),
    deleteByToken: vi.fn(async () => false),
    deleteByTokens: vi.fn(async () => undefined),
    findByEventRecipients: vi.fn(async () => tokens),
  };
  const notifier: PushNotifier = {
    send: vi.fn(async () => ({ invalidTokens: [] })),
  };
  const events = {
    findById: vi.fn(async () => ({ id: "event-1", name: "Asado", participants: [] })),
  } as unknown as EventRepository;
  const participants = {
    findById: vi.fn(async () => ({
      id: "participant-1",
      eventId: "event-1",
      username: "Marta",
      isAnonymous: false,
    })),
  } as unknown as ParticipantRepository;

  return {
    devices,
    notifier,
    events,
    participants,
    service: createNotificationService(devices, notifier, events, participants),
  };
}

describe("NotificationService", () => {
  it("registra y reasigna un token mediante el repository", async () => {
    const { service, devices } = createSetup();

    await service.registerDevice("user-2", "token-1");

    expect(devices.upsertByToken).toHaveBeenCalledWith({ userId: "user-2", token: "token-1" });
  });

  it("desregistra de manera idempotente sin informar tokens ajenos", async () => {
    const { service, devices } = createSetup();

    await expect(service.unregisterDevice("user-1", "missing-token")).resolves.toBeUndefined();
    expect(devices.deleteByToken).toHaveBeenCalledWith("missing-token", "user-1");
  });

  it("notifica a los destinatarios registrados sin incluir al autor y limpia tokens inválidos", async () => {
    const { service, devices, notifier } = createSetup({ tokens: ["token-2", "token-3"] });
    vi.mocked(notifier.send).mockResolvedValueOnce({ invalidTokens: ["token-3"] });

    await service.notifyActivity({
      id: "activity-1",
      eventId: "event-1",
      type: "task_created",
      actorParticipantId: "participant-1",
      payload: { title: "Comprar hielo" },
      createdAt: new Date(),
    });

    expect(devices.findByEventRecipients).toHaveBeenCalledWith("event-1", "participant-1");
    expect(notifier.send).toHaveBeenCalledWith(
      ["token-2", "token-3"],
      expect.objectContaining({
        title: "Asado",
        body: 'Marta agregó una nueva tarea: "Comprar hielo".',
        eventId: "event-1",
        activityType: "task_created",
      }),
    );
    expect(devices.deleteByTokens).toHaveBeenCalledWith(["token-3"]);
  });

  it("no consulta ni envía para actividades que no generan push", async () => {
    const { service, devices, notifier } = createSetup();

    await service.notifyActivity({
      id: "activity-1",
      eventId: "event-1",
      type: "availability_updated",
      actorParticipantId: "participant-1",
      payload: { slotCount: 2 },
      createdAt: new Date(),
    });

    expect(devices.findByEventRecipients).not.toHaveBeenCalled();
    expect(notifier.send).not.toHaveBeenCalled();
  });

  it("no llama al notificador cuando no hay destinatarios", async () => {
    const { service, notifier } = createSetup({ tokens: [] });

    await service.notifyActivity({
      id: "activity-1",
      eventId: "event-1",
      type: "schedule_confirmed",
      actorParticipantId: "participant-1",
      payload: { startDateTime: "2026-10-20T20:00:00.000Z" },
      createdAt: new Date(),
    });

    expect(notifier.send).not.toHaveBeenCalled();
  });
});

describe("buildActivityPushMessage", () => {
  it.each([
    [300000, "$3.000"],
    [150050, "$1.500,50"],
  ])("formatea %i centavos como %s", (totalAmountCents, expectedAmount) => {
    expect(
      buildActivityPushMessage({
        type: "expense_created",
        payload: { description: "Carne", totalAmountCents },
        actorUsername: "Juan",
        eventName: "Asado",
        eventId: "event-1",
      }).body,
    ).toBe(`Juan agregó un gasto de ${expectedAmount}: "Carne".`);
  });

  it("usa texto seguro cuando el payload no tiene la estructura esperada", () => {
    expect(
      buildActivityPushMessage({
        type: "task_created",
        payload: { title: 42 },
        actorUsername: "Marta",
        eventName: "Asado",
        eventId: "event-1",
      }).body,
    ).toBe("Marta agregó una tarea.");
  });
});
