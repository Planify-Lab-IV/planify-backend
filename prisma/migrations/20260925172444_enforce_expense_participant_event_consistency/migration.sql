/*
  Warnings:

  - A unique constraint covering the columns `[id,evento_id]` on the table `gasto` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `evento_id` to the `aportante_gasto` table without a default value. This is not possible if the table is not empty.
  - Added the required column `evento_id` to the `deudor_gasto` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "aportante_gasto" DROP CONSTRAINT "aportante_gasto_gasto_id_fkey";

-- DropForeignKey
ALTER TABLE "aportante_gasto" DROP CONSTRAINT "aportante_gasto_participante_id_fkey";

-- DropForeignKey
ALTER TABLE "deudor_gasto" DROP CONSTRAINT "deudor_gasto_gasto_id_fkey";

-- DropForeignKey
ALTER TABLE "deudor_gasto" DROP CONSTRAINT "deudor_gasto_participante_id_fkey";

-- DropForeignKey
ALTER TABLE "gasto" DROP CONSTRAINT "gasto_creado_por_participante_id_fkey";

-- AlterTable
ALTER TABLE "aportante_gasto" ADD COLUMN     "evento_id" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "deudor_gasto" ADD COLUMN     "evento_id" TEXT NOT NULL;

-- CreateIndex
CREATE INDEX "aportante_gasto_participante_id_evento_id_idx" ON "aportante_gasto"("participante_id", "evento_id");

-- CreateIndex
CREATE INDEX "deudor_gasto_participante_id_evento_id_idx" ON "deudor_gasto"("participante_id", "evento_id");

-- CreateIndex
CREATE UNIQUE INDEX "gasto_id_evento_id_key" ON "gasto"("id", "evento_id");

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_creado_por_participante_id_evento_id_fkey" FOREIGN KEY ("creado_por_participante_id", "evento_id") REFERENCES "participante"("id", "evento_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aportante_gasto" ADD CONSTRAINT "aportante_gasto_gasto_id_evento_id_fkey" FOREIGN KEY ("gasto_id", "evento_id") REFERENCES "gasto"("id", "evento_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aportante_gasto" ADD CONSTRAINT "aportante_gasto_participante_id_evento_id_fkey" FOREIGN KEY ("participante_id", "evento_id") REFERENCES "participante"("id", "evento_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deudor_gasto" ADD CONSTRAINT "deudor_gasto_gasto_id_evento_id_fkey" FOREIGN KEY ("gasto_id", "evento_id") REFERENCES "gasto"("id", "evento_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deudor_gasto" ADD CONSTRAINT "deudor_gasto_participante_id_evento_id_fkey" FOREIGN KEY ("participante_id", "evento_id") REFERENCES "participante"("id", "evento_id") ON DELETE RESTRICT ON UPDATE CASCADE;
