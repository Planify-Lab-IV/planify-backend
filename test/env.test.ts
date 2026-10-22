import { describe, expect, it } from "vitest";
import {
  getAvatarStorageMode,
  getFirebaseServiceAccount,
  parseEnv,
} from "../src/shared/config/env.js";

const baseEnv = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/planify?schema=public",
  JWT_SECRET: "test-secret-que-cumple-con-los-32-caracteres",
};

describe("avatar storage environment", () => {
  it("uses local storage by default outside production", () => {
    const env = parseEnv({ ...baseEnv, NODE_ENV: "development" });

    expect(getAvatarStorageMode(env)).toBe("local");
  });

  it("keeps local storage when it is configured explicitly", () => {
    const env = parseEnv({ ...baseEnv, NODE_ENV: "production", AVATAR_STORAGE: "local" });

    expect(getAvatarStorageMode(env)).toBe("local");
  });

  it("uses no avatar storage in production when it is not configured", () => {
    const env = parseEnv({ ...baseEnv, NODE_ENV: "production" });

    expect(getAvatarStorageMode(env)).toBe("unavailable");
  });

  it("accepts S3 only with bucket and region", () => {
    const env = parseEnv({
      ...baseEnv,
      AVATAR_STORAGE: "s3",
      AVATAR_S3_BUCKET: "planify-avatars",
      AWS_REGION: "us-east-1",
    });

    expect(getAvatarStorageMode(env)).toBe("s3");
  });

  it.each([
    [{ ...baseEnv, AVATAR_STORAGE: "s3", AWS_REGION: "us-east-1" }, "AVATAR_S3_BUCKET"],
    [{ ...baseEnv, AVATAR_STORAGE: "s3", AVATAR_S3_BUCKET: "planify-avatars" }, "AWS_REGION"],
  ])("rejects incomplete S3 configuration", (input, missingVariable) => {
    expect(() => parseEnv(input)).toThrow(missingVariable);
  });
});

describe("Firebase environment", () => {
  const serviceAccount = {
    project_id: "planify",
    client_email: "firebase@planify.iam.gserviceaccount.com",
    private_key: "private-key",
  };

  it("permite no configurar Firebase y usa una cuenta válida cuando está presente", () => {
    expect(getFirebaseServiceAccount(parseEnv(baseEnv))).toBeNull();

    const env = parseEnv({
      ...baseEnv,
      FIREBASE_SERVICE_ACCOUNT_BASE64: Buffer.from(JSON.stringify(serviceAccount)).toString(
        "base64",
      ),
    });
    expect(getFirebaseServiceAccount(env)).toEqual(serviceAccount);
  });

  it.each([
    {
      credential: Buffer.from("credencial que no es JSON y supera el mínimo").toString("base64"),
      description: "no decodifica a JSON",
      expectedMessage:
        "FIREBASE_SERVICE_ACCOUNT_BASE64 debe ser un JSON codificado en base64 válido",
    },
    {
      credential: Buffer.from(
        JSON.stringify({ project_id: "planify", client_email: "firebase@planify.test" }),
      ).toString("base64"),
      description: "no incluye todos los campos requeridos",
      expectedMessage:
        "FIREBASE_SERVICE_ACCOUNT_BASE64 debe incluir project_id, client_email y private_key",
    },
  ])("rechaza una credencial Firebase que $description", ({ credential, expectedMessage }) => {
    expect(() => parseEnv({ ...baseEnv, FIREBASE_SERVICE_ACCOUNT_BASE64: credential })).toThrow(
      expectedMessage,
    );
  });
});
