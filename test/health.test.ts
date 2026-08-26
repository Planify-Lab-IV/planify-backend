import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import app from "../src/app.js";

vi.mock("../src/infrastructure/prisma.js", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

describe("GET /health", () => {
  it("debería retornar 200 con status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});
