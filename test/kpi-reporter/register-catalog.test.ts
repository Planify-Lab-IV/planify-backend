import { describe, expect, it, vi } from "vitest";
import { KPI_CATALOG } from "../../kpi-reporter/catalog.js";
import type { Lab4CatalogClient, Lab4CatalogProject } from "../../kpi-reporter/catalog-client.js";
import { registerKpiCatalog } from "../../kpi-reporter/register-catalog.js";

const project: Lab4CatalogProject = {
  teamNumber: 1,
  projectKey: "project-key",
  name: "Planify",
  environment: "dev",
};

describe("registro del catálogo de KPIs", () => {
  it("crea los diez KPIs si el ambiente es correcto y el catálogo está vacío", async () => {
    const testSetup = createTestSetup();

    await expect(registerKpiCatalog(testSetup.options)).resolves.toEqual({
      environment: "dev",
      existingKpiIds: [],
      createdKpiIds: KPI_CATALOG.map((kpi) => kpi.id),
    });

    expect(testSetup.client.createCatalogEntries).toHaveBeenCalledWith(KPI_CATALOG);
  });

  it("crea solamente los IDs faltantes", async () => {
    const existingKpiIds = ["events_created_month_to_date", "http_requests"];
    const testSetup = createTestSetup({ existingKpiIds });

    await expect(registerKpiCatalog(testSetup.options)).resolves.toMatchObject({
      existingKpiIds,
      createdKpiIds: KPI_CATALOG.filter((kpi) => !existingKpiIds.includes(kpi.id)).map(
        (kpi) => kpi.id,
      ),
    });

    expect(testSetup.client.createCatalogEntries).toHaveBeenCalledWith(
      KPI_CATALOG.filter((kpi) => !existingKpiIds.includes(kpi.id)),
    );
  });

  it("no crea nada si todos los IDs ya están registrados", async () => {
    const testSetup = createTestSetup({ existingKpiIds: KPI_CATALOG.map((kpi) => kpi.id) });

    await expect(registerKpiCatalog(testSetup.options)).resolves.toMatchObject({
      createdKpiIds: [],
    });

    expect(testSetup.client.createCatalogEntries).not.toHaveBeenCalled();
  });

  it("corta antes de leer o crear si la clave no identifica un proyecto", async () => {
    const testSetup = createTestSetup({ project: null });

    await expect(registerKpiCatalog(testSetup.options)).rejects.toThrow(
      "no identifica un proyecto activo",
    );

    expect(testSetup.client.listCatalogIds).not.toHaveBeenCalled();
    expect(testSetup.client.createCatalogEntries).not.toHaveBeenCalled();
  });

  it("corta antes de leer o crear si la clave corresponde a otro ambiente", async () => {
    const testSetup = createTestSetup({ project: { ...project, environment: "prod" } });

    await expect(registerKpiCatalog(testSetup.options)).rejects.toThrow(
      "corresponde al ambiente prod, no a dev",
    );

    expect(testSetup.client.listCatalogIds).not.toHaveBeenCalled();
    expect(testSetup.client.createCatalogEntries).not.toHaveBeenCalled();
  });

  it("no crea entradas si falla la lectura del catálogo", async () => {
    const testSetup = createTestSetup({ catalogError: new Error("Lab4 unavailable") });

    await expect(registerKpiCatalog(testSetup.options)).rejects.toThrow("Lab4 unavailable");

    expect(testSetup.client.createCatalogEntries).not.toHaveBeenCalled();
  });
});

function createTestSetup({
  project: currentProject = project,
  existingKpiIds = [],
  catalogError,
}: {
  project?: Lab4CatalogProject | null;
  existingKpiIds?: readonly string[];
  catalogError?: Error;
} = {}) {
  const client: Lab4CatalogClient & {
    getCurrentProject: ReturnType<typeof vi.fn>;
    listCatalogIds: ReturnType<typeof vi.fn>;
    createCatalogEntries: ReturnType<typeof vi.fn>;
  } = {
    getCurrentProject: vi.fn(async () => currentProject),
    listCatalogIds: vi.fn(async () => {
      if (catalogError) {
        throw catalogError;
      }

      return existingKpiIds;
    }),
    createCatalogEntries: vi.fn(async () => undefined),
  };

  return {
    client,
    options: {
      supabaseUrl: "https://lab4.example",
      supabasePublishableKey: "publishable-key",
      projectKey: "project-key",
      expectedEnvironment: "dev" as const,
      dependencies: {
        createLab4CatalogClient: vi.fn(() => client) as never,
      },
    },
  };
}
