-- CreateTable
CREATE TABLE "invitaciones" (
    "id" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "token_unico" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3),
    "estado" TEXT NOT NULL DEFAULT 'active',

    CONSTRAINT "invitaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "invitaciones_token_unico_key" ON "invitaciones"("token_unico");

-- CreateIndex
CREATE INDEX "invitaciones_evento_id_idx" ON "invitaciones"("evento_id");

-- AddForeignKey
ALTER TABLE "invitaciones" ADD CONSTRAINT "invitaciones_evento_id_fkey" FOREIGN KEY ("evento_id") REFERENCES "evento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
