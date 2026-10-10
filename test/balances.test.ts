import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";
import { createSessionTokenService } from "../src/infrastructure/security/session.token.service.js";
import { prisma } from "../src/infrastructure/prisma.js";
import { env } from "../src/shared/config/env.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: {
    simplifiedDebt: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

function makeCompensatedDebts(userId: string) {
  return [
    {
      amountCents: 500,
      status: "pending",
      eventId: "event-asado",
      debtor: {
        id: "participant-ana-asado",
        userId,
        username: "ana",
        user: { name: "Ana" },
      },
      creditor: {
        id: "participant-marcos-asado",
        userId: "user-marcos",
        username: "marcos",
        user: { name: "Marcos" },
      },
      event: { name: "Asado" },
    },
    {
      amountCents: 300,
      status: "pending",
      eventId: "event-cine",
      debtor: {
        id: "participant-marcos-cine",
        userId: "user-marcos",
        username: "marcos",
        user: { name: "Marcos" },
      },
      creditor: {
        id: "participant-ana-cine",
        userId,
        username: "ana",
        user: { name: "Ana" },
      },
      event: { name: "Cine" },
    },
  ] as never;
}

describe("GET /me/balance", () => {
  const userId = "user-ana";
  const tokenService = createSessionTokenService(env.JWT_SECRET);
  const userToken = tokenService.sign(userId);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve el resumen de deudas pendientes del usuario autenticado", async () => {
    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce([
      {
        amountCents: 5000,
        status: "pending",
        eventId: "event-asado",
        debtor: {
          id: "participant-beto",
          userId: "user-beto",
          username: "beto",
          user: { name: "Beto" },
        },
        creditor: {
          id: "participant-ana-asado",
          userId,
          username: "ana",
          user: { name: "Ana" },
        },
        event: { name: "Asado" },
      },
      {
        amountCents: 2300,
        status: "pending",
        eventId: "event-cine",
        debtor: {
          id: "participant-ana-cine",
          userId,
          username: "ana",
          user: { name: "Ana" },
        },
        creditor: {
          id: "participant-cami",
          userId: "user-cami",
          username: "cami",
          user: { name: "Cami" },
        },
        event: { name: "Cine" },
      },
    ] as never);

    const response = await request(app)
      .get("/me/balance")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      owedToMeCents: 5000,
      iOweCents: 2300,
    });
  });

  it("devuelve 401 sin token", async () => {
    const response = await request(app).get("/me/balance");

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(prisma.simplifiedDebt.findMany).not.toHaveBeenCalled();
  });

  it("devuelve 401 con un token de participante anónimo", async () => {
    const anonymousToken = tokenService.signParticipant("participant-anonymous", "event-1");

    const response = await request(app)
      .get("/me/balance")
      .set("Authorization", `Bearer ${anonymousToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(prisma.simplifiedDebt.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /me/balance/people", () => {
  const userId = "user-ana";
  const tokenService = createSessionTokenService(env.JWT_SECRET);
  const userToken = tokenService.sign(userId);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve una relación neta al compensar deudas de eventos distintos", async () => {
    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce(makeCompensatedDebts(userId));

    const response = await request(app)
      .get("/me/balance/people")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      {
        personKey: "user:user-marcos",
        displayName: "Marcos",
        status: "pay",
        netCents: -200,
      },
    ]);
  });

  it("devuelve 400 para una personKey inválida", async () => {
    const response = await request(app)
      .get("/me/balance/people/clave-invalida")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
    expect(prisma.simplifiedDebt.findMany).not.toHaveBeenCalled();
  });

  it("devuelve 404 cuando no existe una relación con la persona", async () => {
    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce([] as never);

    const response = await request(app)
      .get("/me/balance/people/user:user-inexistente")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
  });

  it.each(["/me/balance/people", "/me/balance/people/user:user-marcos"])(
    "devuelve 401 sin token en %s",
    async (path) => {
      const response = await request(app).get(path);

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("UNAUTHORIZED");
      expect(prisma.simplifiedDebt.findMany).not.toHaveBeenCalled();
    },
  );

  it("devuelve 401 con un token de participante anónimo", async () => {
    const anonymousToken = tokenService.signParticipant("participant-anonymous", "event-1");

    const response = await request(app)
      .get("/me/balance/people")
      .set("Authorization", `Bearer ${anonymousToken}`);

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("UNAUTHORIZED");
    expect(prisma.simplifiedDebt.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /me/balance/people/:personKey", () => {
  const userId = "user-ana";
  const userToken = createSessionTokenService(env.JWT_SECRET).sign(userId);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("devuelve el desglose pendiente por evento y el neto compensado", async () => {
    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce(makeCompensatedDebts(userId));

    const response = await request(app)
      .get("/me/balance/people/user:user-marcos")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      personKey: "user:user-marcos",
      displayName: "Marcos",
      status: "pay",
      netCents: -200,
      breakdown: [
        {
          eventId: "event-asado",
          eventName: "Asado",
          amountCents: 500,
          direction: "i_owe",
        },
        {
          eventId: "event-cine",
          eventName: "Cine",
          amountCents: 300,
          direction: "owed_to_me",
        },
      ],
    });
  });
});

describe("POST /me/balance/people/:personKey/settle", () => {
  const userId = "user-ana";
  const tokenService = createSessionTokenService(env.JWT_SECRET);
  const userToken = tokenService.sign(userId);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("salda las pendientes con una persona y devuelve el estado de cada evento", async () => {
    const transactionFindMany = vi
      .fn()
      .mockResolvedValueOnce([
        { id: "debt-asado", eventId: "event-asado" },
        { id: "debt-cine", eventId: "event-cine" },
      ])
      .mockResolvedValueOnce([{ eventId: "event-cine" }]);
    const transactionUpdateMany = vi.fn().mockResolvedValue({ count: 2 });

    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce(makeCompensatedDebts(userId));
    vi.mocked(prisma.$transaction).mockImplementationOnce((async (
      callback: (tx: unknown) => unknown,
    ) =>
      callback({
        simplifiedDebt: {
          findMany: transactionFindMany,
          updateMany: transactionUpdateMany,
        },
      })) as never);

    const response = await request(app)
      .post("/me/balance/people/user:user-marcos/settle")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      settledCount: 2,
      events: [
        { eventId: "event-asado", allDebtsSettled: true },
        { eventId: "event-cine", allDebtsSettled: false },
      ],
    });
    expect(transactionUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: ["debt-asado", "debt-cine"] }, status: "pending" },
      data: { status: "settled", settledAt: expect.any(Date) },
    });
  });

  it("devuelve 400 para una personKey inválida", async () => {
    const response = await request(app)
      .post("/me/balance/people/clave-invalida/settle")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("INVALID_DATA");
    expect(prisma.simplifiedDebt.findMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("devuelve 404 cuando no existe una relación con la persona", async () => {
    vi.mocked(prisma.simplifiedDebt.findMany).mockResolvedValueOnce([] as never);

    const response = await request(app)
      .post("/me/balance/people/user:user-inexistente/settle")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe("NOT_FOUND");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it.each([undefined, tokenService.signParticipant("participant-anonymous", "event-1")])(
    "requiere un token de usuario registrado",
    async (token) => {
      const requestBuilder = request(app).post("/me/balance/people/user:user-marcos/settle");
      const response = token
        ? await requestBuilder.set("Authorization", `Bearer ${token}`)
        : await requestBuilder;

      expect(response.status).toBe(401);
      expect(response.body.error).toBe("UNAUTHORIZED");
      expect(prisma.simplifiedDebt.findMany).not.toHaveBeenCalled();
    },
  );
});
