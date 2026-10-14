-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Grupo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "Grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Evento" (
    "id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'planificacion',

    CONSTRAINT "Evento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participante" (
    "id" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "es_anonimo" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Participante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_email_key" ON "Usuario"("email");
