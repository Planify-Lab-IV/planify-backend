// Encargado de iniciar/cargar/validar las variables de entorno necesarias para iniciar la app
//

import { z } from "zod";

const envSchema = z.object({
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
});

export const env = envSchema.parse(process.env);
