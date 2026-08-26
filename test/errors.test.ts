import { describe, it, expect } from "vitest";
import request from "supertest";
import app from "../src/app.js";

describe("Ruta inexistente", () => {
  it("debería retornar 404", async () => {
    const res = await request(app).get("/no-existe");
    expect(res.status).toBe(404);
  });
});
