/*
  Warnings:

  - You are about to drop the `Evento` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Evento" DROP CONSTRAINT "Evento_grupo_id_fkey";

-- DropForeignKey
ALTER TABLE "participante" DROP CONSTRAINT "participante_evento_id_fkey";

-- DropTable
DROP TABLE "Evento";

-- CreateTable
CREATE TABLE "evento" (
    "id" TEXT NOT NULL,
    "grupo_id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'planificacion',
    "creado_por_usuario_id" TEXT NOT NULL,
    "lugar_texto" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evento_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_creado_por_usuario_id_fkey" FOREIGN KEY ("creado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participante" ADD CONSTRAINT "participante_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
