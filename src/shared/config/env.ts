// Encargado de iniciar/cargar/validar las variables de entorno necesarias para iniciar la app
//

import { z } from "zod";

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
    // --> Valida que la key JWT sea de al menos 32 caracteres como string
    INTERNAL_KPIS_TOKEN: z.string().min(32).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.AVATAR_STORAGE !== "s3") {
      return;
    }

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

export const env = parseEnv(process.env);
