import { describe, expect, it } from "vitest";
import { getAvatarStorageMode, parseEnv } from "../src/shared/config/env.js";

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

describe("password reset mail environment", () => {
  it("uses console delivery by default and SMTP defaults when it is enabled", () => {
    expect(parseEnv(baseEnv).MAIL_TRANSPORT).toBeUndefined();
    expect(
      parseEnv({
        ...baseEnv,
        MAIL_TRANSPORT: "smtp",
        SMTP_USER: "planify@gmail.com",
        SMTP_PASS: "app-password",
        MAIL_FROM: "Planify <planify@gmail.com>",
      }),
    ).toMatchObject({ MAIL_TRANSPORT: "smtp", SMTP_HOST: "smtp.gmail.com", SMTP_PORT: 465 });
  });

  it.each(["SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const)(
    "rejects SMTP without %s",
    (missingVariable) => {
      const input = {
        ...baseEnv,
        MAIL_TRANSPORT: "smtp",
        SMTP_USER: "planify@gmail.com",
        SMTP_PASS: "app-password",
        MAIL_FROM: "Planify <planify@gmail.com>",
      };
      delete input[missingVariable];

      expect(() => parseEnv(input)).toThrow(missingVariable);
    },
  );

  it("keeps S3 validation when SMTP is also configured", () => {
    expect(() =>
      parseEnv({
        ...baseEnv,
        AVATAR_STORAGE: "s3",
        MAIL_TRANSPORT: "smtp",
        SMTP_USER: "planify@gmail.com",
        SMTP_PASS: "app-password",
        MAIL_FROM: "Planify <planify@gmail.com>",
      }),
    ).toThrow("AVATAR_S3_BUCKET");
  });
});
