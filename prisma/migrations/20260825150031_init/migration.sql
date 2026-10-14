-- AddForeignKey
ALTER TABLE "Evento" ADD CONSTRAINT "Evento_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "Grupo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participante" ADD CONSTRAINT "Participante_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "Evento"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
