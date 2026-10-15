import { KPI_CATALOG, type KpiId } from "./catalog.js";
import { createLab4CatalogClient, type Lab4CatalogProject } from "./catalog-client.js";
import type { KpiEnvironment } from "./measurements.js";

export interface RegisterKpiCatalogOptions {
  supabaseUrl: string;
  supabasePublishableKey: string;
  projectKey: string;
  expectedEnvironment: KpiEnvironment;
  dependencies?: Partial<RegisterKpiCatalogDependencies>;
}

export interface RegisterKpiCatalogDependencies {
  createLab4CatalogClient: typeof createLab4CatalogClient;
}

export interface RegisterKpiCatalogResult {
  environment: KpiEnvironment;
  existingKpiIds: readonly string[];
  createdKpiIds: readonly KpiId[];
}

const defaultDependencies: RegisterKpiCatalogDependencies = {
  createLab4CatalogClient,
};

export async function registerKpiCatalog({
  supabaseUrl,
  supabasePublishableKey,
  projectKey,
  expectedEnvironment,
  dependencies: customDependencies,
}: RegisterKpiCatalogOptions): Promise<RegisterKpiCatalogResult> {
  const dependencies = { ...defaultDependencies, ...customDependencies };
  const client = dependencies.createLab4CatalogClient({
    supabaseUrl,
    supabasePublishableKey,
    projectKey,
  });
  const project = await client.getCurrentProject();

  validateProjectEnvironment(project, expectedEnvironment);

  const existingKpiIds = await client.listCatalogIds();
  const existingKpiIdSet = new Set(existingKpiIds);
  const missingEntries = KPI_CATALOG.filter((kpi) => !existingKpiIdSet.has(kpi.id));

  if (missingEntries.length > 0) {
    await client.createCatalogEntries(missingEntries);
  }

  return {
    environment: expectedEnvironment,
    existingKpiIds,
    createdKpiIds: missingEntries.map((kpi) => kpi.id),
  };
}

function validateProjectEnvironment(
  project: Lab4CatalogProject | null,
  expectedEnvironment: KpiEnvironment,
): asserts project is Lab4CatalogProject {
  if (!project) {
    throw new Error("PROJECT_KEY no identifica un proyecto activo en Lab4");
  }

  if (project.environment !== expectedEnvironment) {
    throw new Error(
      `La PROJECT_KEY corresponde al ambiente ${project.environment}, no a ${expectedEnvironment}`,
    );
  }
}
