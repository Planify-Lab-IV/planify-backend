import { describe, expect, it, vi } from "vitest";
import { measureHealthKpis } from "../../kpi-reporter/sources/health.js";

const apiUrl = "http://planify.example";

describe("fuente de salud del backend", () => {
  it("hace diez sondeos y cuenta sólo las respuestas HTTP 200", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockRejectedValueOnce(new Error("connection refused"))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValue(new Response(null, { status: 500 })) as unknown as typeof fetch;
    const sleep = vi.fn(async () => undefined);

    await expect(measureHealthKpis({ apiUrl, fetchImpl, sleep })).resolves.toEqual({
      health_checks_total: 10,
      health_checks_successful: 2,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(10);
    expect(fetchImpl).toHaveBeenCalledWith(
      new URL("http://planify.example/health"),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(sleep).toHaveBeenCalledTimes(9);
    expect(sleep).toHaveBeenCalledWith(30_000);
  });

  it("falla antes de medir si falta la URL del backend", async () => {
    await expect(measureHealthKpis({ apiUrl: "" })).rejects.toThrow("PLANIFY_API_URL");
  });
});
