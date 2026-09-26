-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('pending', 'settled');

-- CreateTable
CREATE TABLE "deuda_simplificada" (
    "id" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "deudor_participante_id" TEXT NOT NULL,
    "acreedor_participante_id" TEXT NOT NULL,
    "monto_centavos" INTEGER NOT NULL,
    "estado" "DebtStatus" NOT NULL DEFAULT 'pending',
    "saldado_en" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deuda_simplificada_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deuda_simplificada_evento_id_idx" ON "deuda_simplificada"("evento_id");

-- CreateIndex
CREATE INDEX "deuda_simplificada_deudor_participante_id_idx" ON "deuda_simplificada"("deudor_participante_id");

-- CreateIndex
CREATE INDEX "deuda_simplificada_acreedor_participante_id_idx" ON "deuda_simplificada"("acreedor_participante_id");

-- AddForeignKey
ALTER TABLE "deuda_simplificada" ADD CONSTRAINT "deuda_simplificada_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deuda_simplificada" ADD CONSTRAINT "deuda_simplificada_deudor_participante_id_evento_id_fkey" FOREIGN KEY ("deudor_participante_id", "evento_id") REFERENCES "participante"("id", "evento_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deuda_simplificada" ADD CONSTRAINT "deuda_simplificada_acreedor_participante_id_evento_id_fkey" FOREIGN KEY ("acreedor_participante_id", "evento_id") REFERENCES "participante"("id", "evento_id") ON DELETE RESTRICT ON UPDATE CASCADE;
