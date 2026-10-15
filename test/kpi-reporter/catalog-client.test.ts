import { describe, expect, it, vi } from "vitest";
import {
  createLab4CatalogClient,
  type KpiCatalogEntry,
} from "../../kpi-reporter/catalog-client.js";

const supabaseUrl = "https://lab4.example";
const supabasePublishableKey = "publishable-key";
const projectKey = "project-key";
const entries: readonly KpiCatalogEntry[] = [
  {
    id: "http_requests",
    kind: "technical",
    unit: "count",
    description: "Requests de rutas de producto finalizadas durante el día argentino.",
  },
];

describe("cliente del catálogo de Lab4 KPIs", () => {
  it("identifica el proyecto y su ambiente", async () => {
    const fetchImpl = createFetch([
      [
        {
          team_number: 1,
          project_key: projectKey,
          name: "Planify",
          env: "dev",
        },
      ],
    ]);
    const client = createClient(fetchImpl);

    await expect(client.getCurrentProject()).resolves.toEqual({
      teamNumber: 1,
      projectKey,
      name: "Planify",
      environment: "dev",
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://lab4.example/rest/v1/rpc/current_project"),
      {
        method: "POST",
        headers: {
          apikey: supabasePublishableKey,
          "X-Project-Key": projectKey,
          "Content-Type": "application/json",
        },
        body: "{}",
      },
    );
  });

  it("devuelve null si la clave no identifica ningún proyecto", async () => {
    const client = createClient(createFetch([[]]));

    await expect(client.getCurrentProject()).resolves.toBeNull();
  });

  it.each([
    [[{ team_number: 1, project_key: projectKey, name: "Planify", env: "dev" }, {}]],
    [[{ team_number: 1, project_key: projectKey, name: "Planify", env: "invalid" }]],
    [{ unexpected: true }],
  ])("rechaza una respuesta inválida de current_project", async (payload) => {
    const client = createClient(createFetch([payload]));

    await expect(client.getCurrentProject()).rejects.toThrow(
      "current_project con un formato inválido",
    );
  });

  it("consulta los IDs del catálogo ordenados", async () => {
    const fetchImpl = createFetch([
      [{ id: "events_created_month_to_date" }, { id: "http_requests" }],
    ]);
    const client = createClient(fetchImpl);

    await expect(client.listCatalogIds()).resolves.toEqual([
      "events_created_month_to_date",
      "http_requests",
    ]);

    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("https://lab4.example/rest/v1/kpi_catalog?order=id.asc"),
      {
        headers: {
          apikey: supabasePublishableKey,
          "X-Project-Key": projectKey,
        },
      },
    );
  });

  it("rechaza un catálogo con entradas inválidas", async () => {
    const client = createClient(createFetch([[{ id: 1 }]]));

    await expect(client.listCatalogIds()).rejects.toThrow("catálogo con un formato inválido");
  });

  it("crea hasta diez definiciones sin enviar campos administrados por Lab4", async () => {
    const fetchImpl = createFetch([new Response(null, { status: 201 })]);
    const client = createClient(fetchImpl);

    await expect(client.createCatalogEntries(entries)).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledWith(new URL("https://lab4.example/rest/v1/kpi_catalog"), {
      method: "POST",
      headers: {
        apikey: supabasePublishableKey,
        "X-Project-Key": projectKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(entries),
    });
  });

  it("rechaza altas vacías o de más de diez KPIs sin llamar a Lab4", async () => {
    const fetchImpl = createFetch([]);
    const client = createClient(fetchImpl);

    await expect(client.createCatalogEntries([])).rejects.toThrow("entre uno y diez KPIs");
    await expect(
      client.createCatalogEntries(Array.from({ length: 11 }, () => entries[0]!)),
    ).rejects.toThrow("entre uno y diez KPIs");
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("expone errores HTTP de Lab4 sin incluir secretos", async () => {
    const client = createClient(createFetch([new Response("invalid payload", { status: 400 })]));

    await expect(client.createCatalogEntries(entries)).rejects.toThrow("HTTP 400 invalid payload");
  });

  it("falla si falta una credencial", () => {
    expect(() =>
      createLab4CatalogClient({ supabaseUrl, supabasePublishableKey, projectKey: "" }),
    ).toThrow("PROJECT_KEY");
  });
});

function createClient(fetchImpl: typeof fetch) {
  return createLab4CatalogClient({ supabaseUrl, supabasePublishableKey, projectKey, fetchImpl });
}

function createFetch(payloads: unknown[]): typeof fetch {
  return vi.fn(async () => {
    const payload = payloads.shift();

    if (payload instanceof Response) {
      return payload;
    }

    return new Response(JSON.stringify(payload), {
      headers: { "Content-Type": "application/json" },
    });
  }) as unknown as typeof fetch;
}
