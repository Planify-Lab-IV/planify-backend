-- CreateEnum
CREATE TYPE "ActivityType" AS ENUM ('task_created', 'availability_updated', 'expense_created', 'schedule_confirmed');

-- CreateTable
CREATE TABLE "log_actividad" (
    "id" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "tipo" "ActivityType" NOT NULL,
    "actor_participante_id" TEXT NOT NULL,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "log_actividad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "log_actividad_evento_id_created_at_idx" ON "log_actividad"("evento_id", "created_at");

-- AddForeignKey
ALTER TABLE "log_actividad" ADD CONSTRAINT "log_actividad_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "log_actividad" ADD CONSTRAINT "log_actividad_actor_participante_id_evento_id_fkey" FOREIGN KEY ("actor_participante_id", "evento_id") REFERENCES "participante"("id", "evento_id") ON DELETE RESTRICT ON UPDATE CASCADE;
