import { describe, expect, it, vi } from "vitest";
import { runSeedActivity } from "../../kpi-reporter/seed-activity.js";

const GROUP_NAME = "[KPI-SIM] Grupo de pruebas";
const day = "2026-10-14";
const now = new Date("2026-10-14T12:00:00.000Z");

interface SimulatedEvent {
  id: string;
  name: string;
  tasks: string[];
}

describe("actividad simulada para KPIs", () => {
  it("es idempotente contra una API simulada", async () => {
    let groupId: string | undefined;
    const events: SimulatedEvent[] = [];
    let eventCreateRequests = 0;
    let taskCreateRequests = 0;
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = toUrl(input);
      const method = init?.method ?? "GET";

      if (url.pathname === "/auth/login" && method === "POST") {
        return jsonResponse({ token: "token-de-prueba" });
      }

      if (url.pathname === "/me/groups/overview" && method === "GET") {
        return jsonResponse(
          groupId
            ? [
                {
                  id: groupId,
                  name: GROUP_NAME,
                  memberCount: 2,
                  events: events.map((event) => ({ id: event.id, name: event.name })),
                },
              ]
            : [],
        );
      }

      if (url.pathname === "/events" && method === "POST") {
        const body = readJsonBody(init);
        const name = readString(body, "name");
        groupId ??= "group-kpi-sim";
        const event = { id: `event-${events.length + 1}`, name, tasks: [] };
        events.push(event);
        eventCreateRequests += 1;
        return jsonResponse({ id: event.id, groupId, participants: [{}, {}] }, 201);
      }

      const eventId = url.pathname.split("/")[2];
      const event = events.find((candidate) => candidate.id === eventId);
      if (!event) return new Response(null, { status: 404 });

      if (url.pathname.endsWith("/tasks") && method === "GET") {
        return jsonResponse({ tasks: event.tasks.map((title) => ({ title })) });
      }

      if (url.pathname.endsWith("/tasks") && method === "POST") {
        event.tasks.push(readString(readJsonBody(init), "title"));
        taskCreateRequests += 1;
        return jsonResponse({ id: `task-${event.tasks.length}`, title: event.tasks.at(-1) }, 201);
      }

      if (method === "GET") {
        return jsonResponse({ id: event.id });
      }

      return new Response(null, { status: 404 });
    }) as unknown as typeof fetch;
    const options = {
      environmentVariables: {
        PLANIFY_API_URL: "https://planify.test",
        KPI_BOT_IDENTIFIER: "kpi-bot",
        KPI_BOT_PASSWORD: "secret-not-logged",
        KPI_BOT_MEMBER_IDENTIFIER: "kpi-member",
        KPI_REPORT_DATE: day,
      },
      now,
      fetchImpl,
      log: vi.fn(),
    };

    await runSeedActivity(options);

    expect(eventCreateRequests).toBeGreaterThan(0);
    expect(taskCreateRequests).toBeGreaterThan(0);
    const firstEventCount = eventCreateRequests;
    const firstTaskCount = taskCreateRequests;

    await runSeedActivity(options);

    expect(eventCreateRequests).toBe(firstEventCount);
    expect(taskCreateRequests).toBe(firstTaskCount);
  });
});

function toUrl(input: RequestInfo | URL): URL {
  if (input instanceof URL) return input;
  return new URL(input instanceof Request ? input.url : input);
}

function readJsonBody(init: RequestInit | undefined): Record<string, unknown> {
  if (typeof init?.body !== "string") throw new Error("La API simulada esperaba un body JSON");
  const value: unknown = JSON.parse(init.body);
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("La API simulada recibió un body inválido");
  }

  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  if (typeof value !== "string") throw new Error(`Falta ${key} en el body simulado`);
  return value;
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
