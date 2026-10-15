import { createHash } from "node:crypto";

const GROUP_NAME = "[KPI-SIM] Grupo de pruebas";
const LOCATIONS = ["Buenos Aires", "Córdoba", "Rosario", "La Plata"];

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Falta ${name}`);
  return value;
}

function argentinaDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function digest(input) {
  return createHash("sha256").update(input).digest();
}

function eventsForDay(day) {
  const ordinal = Math.floor(Date.parse(`${day}T00:00:00Z`) / 86_400_000);
  const monthlyOffset = digest(day.slice(0, 7))[0];
  return 1 + ((ordinal + monthlyOffset) % 3);
}

async function main() {
  const today = argentinaDay();
  const requestedDay = process.env.KPI_REPORT_DATE?.trim();
  if (requestedDay && requestedDay !== today) {
    console.log(
      `No se genera actividad para ${requestedDay}: solo se simula el día actual (${today}).`,
    );
    return;
  }

  const apiUrl = new URL(required("PLANIFY_API_URL"));
  const organizerIdentifier = required("KPI_BOT_IDENTIFIER");
  const organizerPassword = required("KPI_BOT_PASSWORD");
  const memberIdentifier = required("KPI_BOT_MEMBER_IDENTIFIER");

  async function request(path, { method = "GET", token, body } = {}) {
    const url = new URL(path, apiUrl);
    const response = await fetch(url, {
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
    return response.json();
  }

  const login = await request("/auth/login", {
    method: "POST",
    body: { identifier: organizerIdentifier, password: organizerPassword },
  });
  if (typeof login.token !== "string" || !login.token) {
    throw new Error("El login no devolvió un token de usuario");
  }
  const token = login.token;

  const groups = await request("/me/groups/overview", { token });
  if (!Array.isArray(groups)) throw new Error("/me/groups/overview devolvió un formato inválido");
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
      const payload = {
        name: eventName,
        location: LOCATIONS[digest(`${today}:${index}`)[0] % LOCATIONS.length],
        ...(group
          ? { groupId: group.id }
          : {
              newGroupName: GROUP_NAME,
              memberIdentifiers: [memberIdentifier],
            }),
      };
      event = await request("/events", {
        method: "POST",
        token,
        body: payload,
      });
      if (!event.id || !event.groupId || !Array.isArray(event.participants)) {
        throw new Error("POST /events devolvió un formato inválido");
      }
      if (event.participants.length < 2) {
        throw new Error(`El evento ${eventName} no quedó con dos participantes`);
      }
      if (!group) group = { id: event.groupId, name: GROUP_NAME, memberCount: 2 };
      existingEvents.set(eventName, event);
      createdEvents += 1;
    }

    // Un GET real al detalle suma tráfico de producto y verifica acceso al evento.
    await request(`/events/${encodeURIComponent(event.id)}`, { token });

    // Siempre hay actividad en el primer evento; en los demás varía por fecha.
    const needsTask = index === 0 || digest(`${today}:task:${index}`)[0] % 2 === 0;
    if (!needsTask) continue;
    const taskTitle = `[KPI-SIM] Actividad ${today} #${index + 1}`;
    const taskList = await request(`/events/${encodeURIComponent(event.id)}/tasks`, { token });
    if (!Array.isArray(taskList.tasks)) throw new Error("GET /tasks devolvió un formato inválido");
    if (!taskList.tasks.some((task) => task.title === taskTitle)) {
      await request(`/events/${encodeURIComponent(event.id)}/tasks`, {
        method: "POST",
        token,
        body: { title: taskTitle },
      });
      createdTasks += 1;
    }
  }

  console.log(
    `Actividad [KPI-SIM] ${today}: ${eventCount} eventos objetivo, ${createdEvents} creados, ${createdTasks} tareas creadas.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
