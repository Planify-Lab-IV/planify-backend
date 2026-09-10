/*
  Warnings:

  - A unique constraint covering the columns `[id,evento_id]` on the table `participante` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "availability_slot" DROP CONSTRAINT "availability_slot_participante_id_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "participante_id_evento_id_key" ON "participante"("id", "evento_id");

-- AddForeignKey
ALTER TABLE "availability_slot" ADD CONSTRAINT "availability_slot_participante_id_evento_id_fkey" FOREIGN KEY ("participante_id", "evento_id") REFERENCES "participante"("id", "evento_id") ON DELETE CASCADE ON UPDATE CASCADE;
