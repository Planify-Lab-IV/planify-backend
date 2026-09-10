-- CreateTable
CREATE TABLE "availability_slot" (
    "id" TEXT NOT NULL,
    "participante_id" TEXT NOT NULL,
    "evento_id" TEXT NOT NULL,
    "week_day" INTEGER NOT NULL,
    "hour_block" INTEGER NOT NULL,

    CONSTRAINT "availability_slot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "availability_slot_participante_id_evento_id_idx" ON "availability_slot"("participante_id", "evento_id");

-- CreateIndex
CREATE UNIQUE INDEX "availability_slot_participante_id_evento_id_week_day_hour_b_key" ON "availability_slot"("participante_id", "evento_id", "week_day", "hour_block");

-- AddForeignKey
ALTER TABLE "availability_slot" ADD CONSTRAINT "availability_slot_participante_id_fkey" FOREIGN KEY ("participante_id") REFERENCES "participante"("id") ON DELETE CASCADE ON UPDATE CASCADE;
