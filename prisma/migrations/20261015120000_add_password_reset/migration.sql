-- AlterTable
ALTER TABLE "usuario" ADD COLUMN "password_cambiada_en" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "codigo_recuperacion" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "codigo_hash" TEXT NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "usado_en" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigo_recuperacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "codigo_recuperacion_usuario_id_idx" ON "codigo_recuperacion"("usuario_id");

-- AddForeignKey
ALTER TABLE "codigo_recuperacion" ADD CONSTRAINT "codigo_recuperacion_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
