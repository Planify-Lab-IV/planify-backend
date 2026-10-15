import { describe, expect, it, vi } from "vitest";
import { fetchCiKpis } from "../../kpi-reporter/sources/github-actions.js";

const githubToken = "github-token-de-prueba";
const now = new Date("2026-10-14T00:00:00.000Z");

describe("fuente de GitHub Actions", () => {
  it("pagina ambos repositorios y cuenta sólo corridas recientes y exitosas", async () => {
    const backendFirstPage = Array.from({ length: 100 }, (_unused, index) =>
      createRun("2026-10-13T12:00:00.000Z", index < 60 ? "success" : "failure"),
    );
    const backendSecondPage = [
      createRun("2026-10-07T00:00:00.000Z", "success"),
      createRun("2026-10-08T00:00:00.000Z", "success"),
      createRun("2026-10-06T23:59:59.000Z", "success"),
    ];
    const mobileFirstPage = [
      createRun("2026-10-10T12:00:00.000Z", "failure"),
      createRun("2026-10-09T12:00:00.000Z", "success"),
    ];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString());

      if (url.pathname.includes("planify-backend") && url.searchParams.get("page") === "1") {
        return response({ workflow_runs: backendFirstPage });
      }

      if (url.pathname.includes("planify-backend") && url.searchParams.get("page") === "2") {
        return response({ workflow_runs: backendSecondPage });
      }

      if (url.pathname.includes("planify-mobile")) {
        return response({ workflow_runs: mobileFirstPage });
      }

      throw new Error(`Consulta inesperada: ${url}`);
    }) as unknown as typeof fetch;

    await expect(fetchCiKpis({ githubToken, now, fetchImpl })).resolves.toEqual({
      ci_runs_last_7_days: 104,
      ci_successful_runs_last_7_days: 63,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const requestedUrls = vi
      .mocked(fetchImpl)
      .mock.calls.map(([input]) => new URL(input.toString()).toString());
    expect(requestedUrls).toEqual(
      expect.arrayContaining([
        "https://api.github.com/repos/Planify-Lab-IV/planify-backend/actions/workflows/ci.yml/runs?status=completed&per_page=100&page=1",
        "https://api.github.com/repos/Planify-Lab-IV/planify-backend/actions/workflows/ci.yml/runs?status=completed&per_page=100&page=2",
        "https://api.github.com/repos/Planify-Lab-IV/planify-mobile/actions/workflows/ci.yml/runs?status=completed&per_page=100&page=1",
      ]),
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: `Bearer ${githubToken}` }),
      }),
    );
  });

  it("falla si GitHub no acepta una consulta", async () => {
    const fetchImpl = createFetch(new Response("forbidden", { status: 403 }));

    await expect(fetchCiKpis({ githubToken, now, fetchImpl })).rejects.toThrow(
      "HTTP 403 forbidden",
    );
  });

  it("falla si GitHub devuelve una corrida inválida", async () => {
    const fetchImpl = createFetch({ workflow_runs: [{ conclusion: "success" }] });

    await expect(fetchCiKpis({ githubToken, now, fetchImpl })).rejects.toThrow("formato inválido");
  });
});

function createRun(createdAt: string, conclusion: string) {
  return {
    status: "completed",
    conclusion,
    created_at: createdAt,
  };
}

function response(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: { "Content-Type": "application/json" },
  });
}

function createFetch(...responses: Array<Response | unknown>): typeof fetch {
  const mock = vi.fn(async () => {
    const nextResponse = responses.shift();
    if (nextResponse instanceof Response) {
      return nextResponse;
    }

    return response(nextResponse ?? payloadWithNoRuns());
  });

  return mock as unknown as typeof fetch;
}

function payloadWithNoRuns(): { workflow_runs: [] } {
  return { workflow_runs: [] };
}
