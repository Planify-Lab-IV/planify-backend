import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";

describe("Error handling", () => {
  it("debería retornar 404 JSON para ruta inexistente", async () => {
    const res = await request(app).get("/no-existe");
    expect(res.status).toBe(404);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.error).toBe("NotFoundError");
  });

  it("debería retornar 400 para JSON inválido", async () => {
    const res = await request(app)
      .post("/health")
      .set("Content-Type", "application/json")
      .send("{ invalid json }");
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.error).toBe("INVALID_JSON");
  });

  it("debería retornar 503 cuando la DB falla", async () => {
    const { healthRepository } = await import("../src/repositories/health.repository.js");
    vi.spyOn(healthRepository, "check").mockRejectedValueOnce(new Error("Connection refused"));

    const res = await request(app).get("/health");
    expect(res.status).toBe(503);
    expect(res.headers["content-type"]).toContain("application/json");
    expect(res.body.error).toBe("AppError");
    expect(res.body.message).toBe("Database connection failed");
  });
});
