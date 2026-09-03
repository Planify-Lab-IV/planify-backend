/*
  Warnings:

  - You are about to drop the `Grupo` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Participante` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `Usuario` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Evento" DROP CONSTRAINT "Evento_grupo_id_fkey";

-- DropForeignKey
ALTER TABLE "Participante" DROP CONSTRAINT "Participante_evento_id_fkey";

-- DropTable
DROP TABLE "Grupo";

-- DropTable
DROP TABLE "Participante";

-- DropTable
DROP TABLE "Usuario";

-- CreateTable
CREATE TABLE "usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "miembro_grupo" (
    "usuario_id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,

    CONSTRAINT "miembro_grupo_pkey" PRIMARY KEY ("usuario_id","grupo_id")
);

-- CreateTable
CREATE TABLE "grupo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,

    CONSTRAINT "grupo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participante" (
    "id" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "usuario_id" TEXT,
    "username" TEXT NOT NULL,
    "es_anonimo" BOOLEAN NOT NULL DEFAULT false,
    "es_organizador" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "participante_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_email_key" ON "usuario"("email");

-- CreateIndex
CREATE INDEX "participante_evento_id_idx" ON "participante"("evento_id");

-- CreateIndex
CREATE INDEX "participante_usuario_id_idx" ON "participante"("usuario_id");

-- AddForeignKey
ALTER TABLE "miembro_grupo" ADD CONSTRAINT "miembro_grupo_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "miembro_grupo" ADD CONSTRAINT "miembro_grupo_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participante" ADD CONSTRAINT "participante_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "Evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participante" ADD CONSTRAINT "participante_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
