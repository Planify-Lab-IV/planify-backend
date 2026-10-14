-- CreateEnum
CREATE TYPE "AttendanceState" AS ENUM ('not_confirmed', 'confirmed', 'rejected');

-- AlterTable
ALTER TABLE "participante" ADD COLUMN     "attendance_state" "AttendanceState" NOT NULL DEFAULT 'not_confirmed';
