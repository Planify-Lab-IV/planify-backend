const CI_REPOSITORIES = [
  "Planify-Lab-IV/planify-backend",
  "Planify-Lab-IV/planify-mobile",
] as const;
const CI_WORKFLOW_FILE = "ci.yml";
const RUNS_PER_PAGE = 100;
const SEVEN_DAYS_IN_MS = 7 * 24 * 60 * 60 * 1000;

interface GithubWorkflowRun {
  status: string;
  conclusion: string | null;
  createdAt: number;
}

export interface CiKpis {
  ci_runs_last_7_days: number;
  ci_successful_runs_last_7_days: number;
}

export interface FetchCiKpisOptions {
  githubToken: string;
  now?: Date;
  fetchImpl?: typeof fetch;
}

export async function fetchCiKpis({
  githubToken,
  now = new Date(),
  fetchImpl = fetch,
}: FetchCiKpisOptions): Promise<CiKpis> {
  if (!githubToken) {
    throw new Error("GITHUB_TOKEN es requerido para consultar las corridas de CI");
  }

  if (Number.isNaN(now.getTime())) {
    throw new RangeError("La fecha de referencia de CI debe ser válida");
  }

  const runsByRepository = await Promise.all(
    CI_REPOSITORIES.map((repository) => fetchCompletedRuns(repository, githubToken, fetchImpl)),
  );
  const cutoff = now.getTime() - SEVEN_DAYS_IN_MS;
  const runs = runsByRepository.flat().filter((run) => run.createdAt >= cutoff);

  return {
    ci_runs_last_7_days: runs.length,
    ci_successful_runs_last_7_days: runs.filter((run) => run.conclusion === "success").length,
  };
}

async function fetchCompletedRuns(
  repository: string,
  githubToken: string,
  fetchImpl: typeof fetch,
): Promise<GithubWorkflowRun[]> {
  const allRuns: GithubWorkflowRun[] = [];

  for (let page = 1; ; page += 1) {
    const url = new URL(
      `https://api.github.com/repos/${repository}/actions/workflows/${CI_WORKFLOW_FILE}/runs`,
    );
    url.searchParams.set("status", "completed");
    url.searchParams.set("per_page", String(RUNS_PER_PAGE));
    url.searchParams.set("page", String(page));

    const response = await fetchImpl(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${githubToken}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });

    if (!response.ok) {
      const responseBody = await response.text();
      throw new Error(
        `No se pudieron consultar las corridas de CI de ${repository}: HTTP ${response.status}${responseBody ? ` ${responseBody}` : ""}`,
      );
    }

    const pageRuns = parseWorkflowRuns(await response.json());
    allRuns.push(...pageRuns);

    if (pageRuns.length < RUNS_PER_PAGE) {
      return allRuns;
    }
  }
}

function parseWorkflowRuns(payload: unknown): GithubWorkflowRun[] {
  if (!isRecord(payload) || !Array.isArray(payload.workflow_runs)) {
    throw new Error("La API de GitHub devolvió corridas de CI con un formato inválido");
  }

  return payload.workflow_runs.map((run) => {
    if (
      !isRecord(run) ||
      typeof run.status !== "string" ||
      (typeof run.conclusion !== "string" && run.conclusion !== null) ||
      typeof run.created_at !== "string"
    ) {
      throw new Error("La API de GitHub devolvió una corrida de CI con un formato inválido");
    }

    const createdAt = new Date(run.created_at).getTime();
    if (Number.isNaN(createdAt)) {
      throw new Error("La API de GitHub devolvió una fecha de corrida inválida");
    }

    return {
      status: run.status,
      conclusion: run.conclusion,
      createdAt,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
