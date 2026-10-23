// Encargado de iniciar/cargar/validar las variables de entorno necesarias para iniciar la app
//

import { z } from "zod";

export interface FirebaseServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    // --> La var de inicio debe ser una de esas 3, sino, toma dev por defecto
    PORT: z.coerce.number().default(3000),
    // --> reconvierte el puerto a un numero, y lo setea como 3000 por defecto
    DATABASE_URL: z.url(),
    // --> Valida existencia de la variable DATABASE_URL
    CORS_ORIGIN: z.string().default("http://localhost:5173"),
    // --> Valida que la direccion sea un string y defaultea
    JWT_SECRET: z.string().min(32),
    // --> Valida que la key JWT sea de al menos 32 caracteres como string
    AVATAR_STORAGE: z.enum(["local", "s3"]).optional(),
    AVATAR_S3_BUCKET: z.string().trim().min(1).optional(),
    AWS_REGION: z.string().trim().min(1).optional(),
    MAIL_TRANSPORT: z.enum(["console", "smtp"]).optional(),
    SMTP_HOST: z.string().trim().min(1).default("smtp.gmail.com"),
    SMTP_PORT: z.coerce
      .number()
      .int()
      .refine((port) => port === 465 || port === 587, "SMTP_PORT debe ser 465 o 587")
      .default(465),
    SMTP_USER: z.string().trim().min(1).optional(),
    SMTP_PASS: z.string().trim().min(1).optional(),
    MAIL_FROM: z.string().trim().min(1).optional(),
    // --> Valida que la key JWT sea de al menos 32 caracteres como string
    INTERNAL_KPIS_TOKEN: z.string().min(32).optional(),
    FIREBASE_SERVICE_ACCOUNT_BASE64: z.string().trim().min(32).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.AVATAR_STORAGE === "s3") {
      if (!value.AVATAR_S3_BUCKET) {
        ctx.addIssue({
          code: "custom",
          path: ["AVATAR_S3_BUCKET"],
          message: "AVATAR_S3_BUCKET es obligatoria cuando AVATAR_STORAGE es s3",
        });
      }

      if (!value.AWS_REGION) {
        ctx.addIssue({
          code: "custom",
          path: ["AWS_REGION"],
          message: "AWS_REGION es obligatoria cuando AVATAR_STORAGE es s3",
        });
      }
    }

    if (value.MAIL_TRANSPORT === "smtp") {
      for (const variable of ["SMTP_USER", "SMTP_PASS", "MAIL_FROM"] as const) {
        if (!value[variable]) {
          ctx.addIssue({
            code: "custom",
            path: [variable],
            message: `${variable} es obligatoria cuando MAIL_TRANSPORT es smtp`,
          });
        }
      }
    }

    if (value.FIREBASE_SERVICE_ACCOUNT_BASE64) {
      try {
        decodeFirebaseServiceAccount(value.FIREBASE_SERVICE_ACCOUNT_BASE64);
      } catch (error) {
        ctx.addIssue({
          code: "custom",
          path: ["FIREBASE_SERVICE_ACCOUNT_BASE64"],
          message: error instanceof Error ? error.message : "La credencial de Firebase es inválida",
        });
      }
    }
  });

export type Env = z.infer<typeof envSchema>;

export type AvatarStorageMode = "local" | "s3" | "unavailable";

export function parseEnv(input: Record<string, string | undefined>): Env {
  return envSchema.parse(input);
}

export function getAvatarStorageMode(
  config: Pick<Env, "NODE_ENV" | "AVATAR_STORAGE">,
): AvatarStorageMode {
  if (config.AVATAR_STORAGE) {
    return config.AVATAR_STORAGE;
  }

  return config.NODE_ENV === "production" ? "unavailable" : "local";
}

export function getFirebaseServiceAccount(
  config: Pick<Env, "FIREBASE_SERVICE_ACCOUNT_BASE64">,
): FirebaseServiceAccount | null {
  if (!config.FIREBASE_SERVICE_ACCOUNT_BASE64) {
    return null;
  }

  return decodeFirebaseServiceAccount(config.FIREBASE_SERVICE_ACCOUNT_BASE64);
}

function decodeFirebaseServiceAccount(value: string): FirebaseServiceAccount {
  let decoded: string;
  let parsed: unknown;

  try {
    decoded = Buffer.from(value, "base64").toString("utf8");
    parsed = JSON.parse(decoded);
  } catch {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_BASE64 debe ser un JSON codificado en base64 válido");
  }

  if (
    !isRecord(parsed) ||
    typeof parsed.project_id !== "string" ||
    parsed.project_id.trim() === "" ||
    typeof parsed.client_email !== "string" ||
    parsed.client_email.trim() === "" ||
    typeof parsed.private_key !== "string" ||
    parsed.private_key.trim() === ""
  ) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_BASE64 debe incluir project_id, client_email y private_key",
    );
  }

  return {
    project_id: parsed.project_id,
    client_email: parsed.client_email,
    private_key: parsed.private_key,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export const env = parseEnv(process.env);
