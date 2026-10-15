import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";

const GROUP_NAME = "[KPI-SIM] Grupo de pruebas";
const LOCATIONS = ["Buenos Aires", "Córdoba", "Rosario", "La Plata"] as const;

type HttpMethod = "GET" | "POST";
type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];
type JsonObject = { readonly [key: string]: JsonValue };

interface RequestOptions {
  method?: HttpMethod;
  token?: string;
  body?: JsonObject;
}

interface LoginResponse {
  token: string;
}

interface GroupEvent {
  id: string;
  name: string;
}

interface GroupOverview {
  id: string;
  name: string;
  memberCount: number;
  events: GroupEvent[];
}

interface CreatedEvent {
  id: string;
  groupId: string;
  participants: unknown[];
}

interface TaskListResponse {
  tasks: Array<{ title: string }>;
}

export interface SeedActivityOptions {
  environmentVariables?: NodeJS.ProcessEnv;
  now?: Date;
  fetchImpl?: typeof fetch;
  log?: (message: string) => void;
}

export async function runSeedActivity({
  environmentVariables = process.env,
  now = new Date(),
  fetchImpl = fetch,
  log = (message) => console.log(message),
}: SeedActivityOptions = {}): Promise<void> {
  const today = argentinaDay(now);
  const requestedDay = environmentVariables.KPI_REPORT_DATE?.trim();
  if (requestedDay && requestedDay !== today) {
    log(`No se genera actividad para ${requestedDay}: solo se simula el día actual (${today}).`);
    return;
  }

  const apiUrl = new URL(required(environmentVariables, "PLANIFY_API_URL"));
  const organizerIdentifier = required(environmentVariables, "KPI_BOT_IDENTIFIER");
  const organizerPassword = required(environmentVariables, "KPI_BOT_PASSWORD");
  const memberIdentifier = required(environmentVariables, "KPI_BOT_MEMBER_IDENTIFIER");

  async function request<T>(
    path: string,
    parseResponse: (payload: unknown) => T,
    { method = "GET", token, body }: RequestOptions = {},
  ): Promise<T> {
    const url = new URL(path, apiUrl);
    const response = await fetchImpl(url, {
      method,
      headers: {
        ...(body ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // No imprimir cuerpos de login ni tokens en los logs públicos de Actions.
      throw new Error(`${method} ${url.pathname} respondió HTTP ${response.status}`);
    }

    return parseResponse(await response.json());
  }

  const login = await request("/auth/login", parseLoginResponse, {
    method: "POST",
    body: { identifier: organizerIdentifier, password: organizerPassword },
  });
  const token = login.token;

  const groups = await request("/me/groups/overview", parseGroupOverviews, { token });
  const matchingGroups = groups.filter((group) => group.name === GROUP_NAME);
  if (matchingGroups.length > 1) throw new Error(`Hay más de un grupo ${GROUP_NAME}`);
  let group = matchingGroups[0];
  if (group && group.memberCount < 2) {
    throw new Error(`El grupo ${GROUP_NAME} no tiene al menos dos miembros`);
  }

  const existingEvents = new Map((group?.events ?? []).map((event) => [event.name, event]));
  const eventCount = eventsForDay(today);
  let createdEvents = 0;
  let createdTasks = 0;

  for (let index = 0; index < eventCount; index += 1) {
    const eventName = `[KPI-SIM] ${today} #${index + 1}`;
    let event = existingEvents.get(eventName);
    if (!event) {
      const payload: JsonObject = {
        name: eventName,
        location: locationFor(`${today}:${index}`),
        ...(group
          ? { groupId: group.id }
          : {
              newGroupName: GROUP_NAME,
              memberIdentifiers: [memberIdentifier],
            }),
      };
      const createdEvent = await request("/events", parseCreatedEvent, {
        method: "POST",
        token,
        body: payload,
      });
      if (createdEvent.participants.length < 2) {
        throw new Error(`El evento ${eventName} no quedó con dos participantes`);
      }

      event = { id: createdEvent.id, name: eventName };
      if (!group) {
        group = { id: createdEvent.groupId, name: GROUP_NAME, memberCount: 2, events: [] };
      }
      existingEvents.set(eventName, event);
      createdEvents += 1;
    }

    // Un GET real al detalle suma tráfico de producto y verifica acceso al evento.
    await request(`/events/${encodeURIComponent(event.id)}`, parseObject, { token });

    // Siempre hay actividad en el primer evento; en los demás varía por fecha.
    const needsTask = index === 0 || firstDigestByte(`${today}:task:${index}`) % 2 === 0;
    if (!needsTask) continue;
    const taskTitle = `[KPI-SIM] Actividad ${today} #${index + 1}`;
    const taskList = await request(`/events/${encodeURIComponent(event.id)}/tasks`, parseTaskList, {
      token,
    });
    if (!taskList.tasks.some((task) => task.title === taskTitle)) {
      await request(`/events/${encodeURIComponent(event.id)}/tasks`, parseObject, {
        method: "POST",
        token,
        body: { title: taskTitle },
      });
      createdTasks += 1;
    }
  }

  log(
    `Actividad [KPI-SIM] ${today}: ${eventCount} eventos objetivo, ${createdEvents} creados, ${createdTasks} tareas creadas.`,
  );
}

function required(environmentVariables: NodeJS.ProcessEnv, name: string): string {
  const value = environmentVariables[name]?.trim();
  if (!value) throw new Error(`Falta ${name}`);
  return value;
}

function argentinaDay(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return `${datePart(parts, "year")}-${datePart(parts, "month")}-${datePart(parts, "day")}`;
}

function datePart(
  parts: readonly Intl.DateTimeFormatPart[],
  type: "year" | "month" | "day",
): string {
  const part = parts.find((candidate) => candidate.type === type);
  if (!part) throw new Error(`No se pudo obtener ${type} de la fecha argentina`);
  return part.value;
}

function eventsForDay(day: string): number {
  const ordinal = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  return 1 + ((ordinal + firstDigestByte(day.slice(0, 7))) % 3);
}

function locationFor(input: string): string {
  const location = LOCATIONS[firstDigestByte(input) % LOCATIONS.length];
  if (!location) throw new Error("No se pudo seleccionar una ubicación para la actividad simulada");
  return location;
}

function firstDigestByte(input: string): number {
  const byte = createHash("sha256").update(input).digest()[0];
  if (byte === undefined) throw new Error("No se pudo calcular el hash de la actividad simulada");
  return byte;
}

function parseLoginResponse(payload: unknown): LoginResponse {
  const response = parseObject(payload);
  return { token: requiredString(response, "token", "El login no devolvió un token de usuario") };
}

function parseGroupOverviews(payload: unknown): GroupOverview[] {
  if (!Array.isArray(payload)) {
    throw new Error("/me/groups/overview devolvió un formato inválido");
  }

  return payload.map((group) => {
    const response = parseObject(group);
    const events = response.events;
    if (!Array.isArray(events)) {
      throw new Error("/me/groups/overview devolvió un formato inválido");
    }

    const memberCount = response.memberCount;
    if (!isNonNegativeInteger(memberCount)) {
      throw new Error("/me/groups/overview devolvió un formato inválido");
    }

    return {
      id: requiredString(response, "id", "/me/groups/overview devolvió un formato inválido"),
      name: requiredString(response, "name", "/me/groups/overview devolvió un formato inválido"),
      memberCount,
      events: events.map((event) => {
        const eventResponse = parseObject(event);
        return {
          id: requiredString(
            eventResponse,
            "id",
            "/me/groups/overview devolvió un formato inválido",
          ),
          name: requiredString(
            eventResponse,
            "name",
            "/me/groups/overview devolvió un formato inválido",
          ),
        };
      }),
    };
  });
}

function parseCreatedEvent(payload: unknown): CreatedEvent {
  const response = parseObject(payload);
  const participants = response.participants;
  if (!Array.isArray(participants)) {
    throw new Error("POST /events devolvió un formato inválido");
  }

  return {
    id: requiredString(response, "id", "POST /events devolvió un formato inválido"),
    groupId: requiredString(response, "groupId", "POST /events devolvió un formato inválido"),
    participants,
  };
}

function parseTaskList(payload: unknown): TaskListResponse {
  const response = parseObject(payload);
  const tasks = response.tasks;
  if (!Array.isArray(tasks)) {
    throw new Error("GET /tasks devolvió un formato inválido");
  }

  return {
    tasks: tasks.map((task) => {
      const taskResponse = parseObject(task);
      return {
        title: requiredString(taskResponse, "title", "GET /tasks devolvió un formato inválido"),
      };
    }),
  };
}

function parseObject(payload: unknown): Record<string, unknown> {
  if (!isRecord(payload)) {
    throw new Error("La API devolvió un formato inválido");
  }

  return payload;
}

function requiredString(record: Record<string, unknown>, key: string, message: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw new Error(message);
  return value;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function main(): Promise<void> {
  await runSeedActivity();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
