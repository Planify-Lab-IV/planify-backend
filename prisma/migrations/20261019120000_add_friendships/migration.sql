-- CreateEnum
CREATE TYPE "FriendshipStatus" AS ENUM ('pending', 'accepted');

-- CreateTable
CREATE TABLE "amistad" (
    "id" TEXT NOT NULL,
    "solicitante_id" TEXT NOT NULL,
    "receptor_id" TEXT NOT NULL,
    "clave_par" TEXT NOT NULL,
    "estado" "FriendshipStatus" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amistad_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "amistad_clave_par_key" ON "amistad"("clave_par");

-- CreateIndex
CREATE INDEX "amistad_solicitante_id_idx" ON "amistad"("solicitante_id");

-- CreateIndex
CREATE INDEX "amistad_receptor_id_idx" ON "amistad"("receptor_id");

-- AddForeignKey
ALTER TABLE "amistad" ADD CONSTRAINT "amistad_solicitante_id_fkey" FOREIGN KEY ("solicitante_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amistad" ADD CONSTRAINT "amistad_receptor_id_fkey" FOREIGN KEY ("receptor_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
