-- CreateTable
CREATE TABLE "gasto" (
    "id" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "monto_total_centavos" INTEGER NOT NULL,
    "creado_por_participante_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gasto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aportante_gasto" (
    "gasto_id" TEXT NOT NULL,
    "participante_id" TEXT NOT NULL,
    "monto_centavos" INTEGER NOT NULL,

    CONSTRAINT "aportante_gasto_pkey" PRIMARY KEY ("gasto_id","participante_id")
);

-- CreateTable
CREATE TABLE "deudor_gasto" (
    "gasto_id" TEXT NOT NULL,
    "participante_id" TEXT NOT NULL,
    "monto_centavos" INTEGER NOT NULL,

    CONSTRAINT "deudor_gasto_pkey" PRIMARY KEY ("gasto_id","participante_id")
);

-- CreateIndex
CREATE INDEX "gasto_evento_id_idx" ON "gasto"("evento_id");

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gasto" ADD CONSTRAINT "gasto_creado_por_participante_id_fkey" FOREIGN KEY ("creado_por_participante_id") REFERENCES "participante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aportante_gasto" ADD CONSTRAINT "aportante_gasto_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gasto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aportante_gasto" ADD CONSTRAINT "aportante_gasto_participante_id_fkey" FOREIGN KEY ("participante_id") REFERENCES "participante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deudor_gasto" ADD CONSTRAINT "deudor_gasto_gasto_id_fkey" FOREIGN KEY ("gasto_id") REFERENCES "gasto"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deudor_gasto" ADD CONSTRAINT "deudor_gasto_participante_id_fkey" FOREIGN KEY ("participante_id") REFERENCES "participante"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
