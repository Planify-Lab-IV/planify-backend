import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createPasswordHasher } from "../src/infrastructure/security/password.hasher.js";
import { env } from "../src/shared/config/env.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const hasher = createPasswordHasher();

const DEV_USERS = [
  {
    nombre: "dev1",
    email: "dev1@planify.dev",
    passwordPlano: "DevPass123!",
  },
  {
    nombre: "dev2",
    email: "dev2@planify.dev",
    passwordPlano: "DevPass123!",
  },
  {
    nombre: "dev3",
    email: "dev3@planify.dev",
    passwordPlano: "DevPass123!", // --> Hash deberia ser diferente entre users pese a ser igual la password
  },
];

// --> Itera los 3 users, genera hash y hace upsert de manera que se pueda ejecutar las veces que sea
async function main() {
  for (const u of DEV_USERS) {
    const passwordHash = await hasher.hash(u.passwordPlano);

    const user = await prisma.usuario.upsert({
      where: { email: u.email },
      update: {
        nombre: u.nombre,
        passwordHash,
      },
      create: {
        nombre: u.nombre,
        email: u.email,
        passwordHash,
      },
    });

    console.log(`Usuario listo: ${user.email}`);
  }

  console.log("Seed completado.");
}

main()
  .catch((e) => {
    console.error("Error ejecutando la seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect(); // --> Para que no se cuelgue la conexión
  });
