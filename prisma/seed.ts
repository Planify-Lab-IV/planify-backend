import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { createPasswordHasher } from "../src/infrastructure/security/password.hasher.js";
import { env } from "../src/shared/config/env.js";

const adapter = new PrismaPg({ connectionString: env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });
const hasher = createPasswordHasher();

const DEV_USERS = [
  {
    name: "dev1",
    username: "dev1",
    email: "dev1@planify.dev",
    passwordPlano: "DevPass123!",
  },
  {
    name: "dev2",
    username: "dev2",
    email: "dev2@planify.dev",
    passwordPlano: "DevPass123!",
  },
  {
    name: "dev3",
    username: "dev3",
    email: "dev3@planify.dev",
    passwordPlano: "DevPass123!", // --> Hash deberia ser diferente entre users pese a ser igual la password
  },
];

// --> Itera los 3 users, genera hash y hace upsert de manera que se pueda ejecutar las veces que sea
async function main() {
  for (const u of DEV_USERS) {
    const passwordHash = await hasher.hash(u.passwordPlano);

    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        username: u.username,
        passwordHash,
      },
      create: {
        name: u.name,
        username: u.username,
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
