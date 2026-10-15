import type { KpiDefinition } from "./catalog.js";
import type { KpiEnvironment } from "./measurements.js";

const CURRENT_PROJECT_PATH = "/rest/v1/rpc/current_project";
const KPI_CATALOG_PATH = "/rest/v1/kpi_catalog";

export interface Lab4CatalogClientOptions {
  supabaseUrl: string;
  supabasePublishableKey: string;
  projectKey: string;
  fetchImpl?: typeof fetch;
}

export interface Lab4CatalogProject {
  teamNumber: number;
  projectKey: string;
  name: string;
  environment: KpiEnvironment;
}

export type KpiCatalogEntry = Pick<KpiDefinition, "id" | "kind" | "unit" | "description">;

export interface Lab4CatalogClient {
  getCurrentProject(): Promise<Lab4CatalogProject | null>;
  listCatalogIds(): Promise<readonly string[]>;
  createCatalogEntries(entries: readonly KpiCatalogEntry[]): Promise<void>;
}

export function createLab4CatalogClient({
  supabaseUrl,
  supabasePublishableKey,
  projectKey,
  fetchImpl = fetch,
}: Lab4CatalogClientOptions): Lab4CatalogClient {
  validateConfiguration({ supabaseUrl, supabasePublishableKey, projectKey });
  const headers = createHeaders({ supabasePublishableKey, projectKey });

  return {
    async getCurrentProject(): Promise<Lab4CatalogProject | null> {
      const response = await fetchImpl(new URL(CURRENT_PROJECT_PATH, supabaseUrl), {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!response.ok) {
        throw await createLab4CatalogResponseError("identificar el proyecto", response);
      }

      return parseCurrentProject(await response.json());
    },

    async listCatalogIds(): Promise<readonly string[]> {
      const url = new URL(KPI_CATALOG_PATH, supabaseUrl);
      url.searchParams.set("order", "id.asc");

      const response = await fetchImpl(url, { headers });

      if (!response.ok) {
        throw await createLab4CatalogResponseError("consultar el catálogo", response);
      }

      return parseCatalogIds(await response.json());
    },

    async createCatalogEntries(entries): Promise<void> {
      if (entries.length === 0 || entries.length > 10) {
        throw new Error("El alta del catálogo debe contener entre uno y diez KPIs");
      }

      const response = await fetchImpl(new URL(KPI_CATALOG_PATH, supabaseUrl), {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(entries.map(toCatalogPayload)),
      });

      if (response.status !== 201) {
        throw await createLab4CatalogResponseError("crear KPIs del catálogo", response);
      }
    },
  };
}

function validateConfiguration({
  supabaseUrl,
  supabasePublishableKey,
  projectKey,
}: Omit<Lab4CatalogClientOptions, "fetchImpl">): void {
  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL es requerida para registrar el catálogo de KPIs");
  }

  if (!supabasePublishableKey) {
    throw new Error("SUPABASE_PUBLISHABLE_KEY es requerida para registrar el catálogo de KPIs");
  }

  if (!projectKey) {
    throw new Error("PROJECT_KEY es requerida para registrar el catálogo de KPIs");
  }
}

function createHeaders({
  supabasePublishableKey,
  projectKey,
}: Pick<Lab4CatalogClientOptions, "supabasePublishableKey" | "projectKey">): Record<
  string,
  string
> {
  return {
    apikey: supabasePublishableKey,
    "X-Project-Key": projectKey,
  };
}

function toCatalogPayload({ id, kind, unit, description }: KpiCatalogEntry): KpiCatalogEntry {
  return { id, kind, unit, description };
}

async function createLab4CatalogResponseError(action: string, response: Response): Promise<Error> {
  const responseBody = await response.text();
  return new Error(
    `Lab4 no pudo ${action}: HTTP ${response.status}${responseBody ? ` ${responseBody}` : ""}`,
  );
}

function parseCurrentProject(payload: unknown): Lab4CatalogProject | null {
  if (!Array.isArray(payload)) {
    throw new Error("Lab4 devolvió current_project con un formato inválido");
  }

  if (payload.length === 0) {
    return null;
  }

  if (payload.length !== 1 || !isRecord(payload[0])) {
    throw new Error("Lab4 devolvió current_project con un formato inválido");
  }

  const project = payload[0];

  if (
    typeof project.team_number !== "number" ||
    !Number.isInteger(project.team_number) ||
    typeof project.project_key !== "string" ||
    typeof project.name !== "string" ||
    !isKpiEnvironment(project.env)
  ) {
    throw new Error("Lab4 devolvió current_project con un formato inválido");
  }

  return {
    teamNumber: project.team_number,
    projectKey: project.project_key,
    name: project.name,
    environment: project.env,
  };
}

function parseCatalogIds(payload: unknown): readonly string[] {
  if (!Array.isArray(payload)) {
    throw new Error("Lab4 devolvió el catálogo con un formato inválido");
  }

  return payload.map((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || entry.id.length === 0) {
      throw new Error("Lab4 devolvió el catálogo con un formato inválido");
    }

    return entry.id;
  });
}

function isKpiEnvironment(value: unknown): value is KpiEnvironment {
  return value === "dev" || value === "qa" || value === "prod";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
