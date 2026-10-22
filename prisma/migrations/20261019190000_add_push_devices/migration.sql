-- CreateTable
CREATE TABLE "dispositivo_push" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "push_token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dispositivo_push_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dispositivo_push_push_token_key" ON "dispositivo_push"("push_token");

-- CreateIndex
CREATE INDEX "dispositivo_push_usuario_id_idx" ON "dispositivo_push"("usuario_id");

-- AddForeignKey
ALTER TABLE "dispositivo_push" ADD CONSTRAINT "dispositivo_push_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
