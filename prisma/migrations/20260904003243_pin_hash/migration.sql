/*
  Warnings:

  - A unique constraint covering the columns `[evento_id,username]` on the table `participante` will be added. If there are existing duplicate values, this will fail.
  - Made the column `creado_por_usuario_id` on table `evento` required. This step will fail if there are existing NULL values in that column.
  - Made the column `lugar_texto` on table `evento` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "evento" ALTER COLUMN "creado_por_usuario_id" SET NOT NULL,
ALTER COLUMN "lugar_texto" SET NOT NULL,
ALTER COLUMN "updated_at" DROP DEFAULT;
ALTER TABLE "evento" RENAME CONSTRAINT "Evento_pkey" TO "evento_pkey";

-- AlterTable
ALTER TABLE "participante" ADD COLUMN     "pin_hash" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "participante_evento_id_username_key" ON "participante"("evento_id", "username");

-- RenameForeignKey
ALTER TABLE "evento" RENAME CONSTRAINT "Evento_grupo_id_fkey" TO "evento_grupo_id_fkey";
