// Singleton que exporta una instancia de prismaClient

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { env } from "../shared/config/env.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL! });
export const prisma = new PrismaClient({ adapter });
