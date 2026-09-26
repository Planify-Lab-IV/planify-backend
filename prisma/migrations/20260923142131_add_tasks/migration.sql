-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('unassigned', 'pending', 'completed');

-- CreateTable
CREATE TABLE "tarea" (
    "id" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "estado" "TaskStatus" NOT NULL DEFAULT 'unassigned',
    "asignado_a_participante_id" TEXT,
    "creado_por_participante_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarea_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tarea_evento_id_idx" ON "tarea"("evento_id");

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_asignado_a_participante_id_evento_id_fkey" FOREIGN KEY ("asignado_a_participante_id", "evento_id") REFERENCES "participante"("id", "evento_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_creado_por_participante_id_evento_id_fkey" FOREIGN KEY ("creado_por_participante_id", "evento_id") REFERENCES "participante"("id", "evento_id") ON DELETE RESTRICT ON UPDATE CASCADE;
