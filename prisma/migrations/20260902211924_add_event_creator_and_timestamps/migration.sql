-- Preserve existing events while aligning the table name with the Prisma mapping.
ALTER TABLE "Evento" RENAME TO "evento";

-- Existing events have no known organizer, so this column remains nullable.
ALTER TABLE "evento" ADD COLUMN "creado_por_usuario_id" TEXT;
ALTER TABLE "evento" ADD COLUMN "lugar_texto" TEXT;
ALTER TABLE "evento" ADD COLUMN "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "evento" ADD COLUMN "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AddForeignKey
ALTER TABLE "evento" ADD CONSTRAINT "evento_creado_por_usuario_id_fkey" FOREIGN KEY ("creado_por_usuario_id") REFERENCES "usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
