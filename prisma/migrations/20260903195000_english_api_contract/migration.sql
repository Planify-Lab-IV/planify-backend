-- Keep the established Spanish column names while exposing English Prisma fields.
ALTER TABLE "usuario" ADD COLUMN "username" TEXT;

-- Existing display names were not unique. Generate a stable, unique username for
-- legacy rows; the application/seed can subsequently choose friendlier usernames.
WITH normalized_users AS (
  SELECT
    "id",
    COALESCE(NULLIF(LOWER(REGEXP_REPLACE("nombre", '[^a-zA-Z0-9_]+', '_', 'g')), ''), 'user') AS base_username
  FROM "usuario"
)
UPDATE "usuario" AS user_record
SET "username" = normalized_users.base_username || '_' || LEFT(REPLACE(user_record."id", '-', ''), 8)
FROM normalized_users
WHERE user_record."id" = normalized_users."id";

ALTER TABLE "usuario" ALTER COLUMN "username" SET NOT NULL;
CREATE UNIQUE INDEX "usuario_username_key" ON "usuario"("username");

-- Translate the retired default before accepting only the current statuses.
UPDATE "evento" SET "estado" = 'active' WHERE "estado" NOT IN ('active', 'cancelled');
ALTER TABLE "evento" ALTER COLUMN "estado" SET DEFAULT 'active';
ALTER TABLE "evento"
  ADD CONSTRAINT "evento_estado_check" CHECK ("estado" IN ('active', 'cancelled')) NOT VALID;

-- Legacy events may predate the authenticated-creator/location flow. The NOT VALID
-- constraints preserve those records but enforce the required fields for all new rows.
ALTER TABLE "evento"
  ADD CONSTRAINT "evento_organizer_required_check" CHECK ("creado_por_usuario_id" IS NOT NULL) NOT VALID,
  ADD CONSTRAINT "evento_location_required_check" CHECK (LENGTH(BTRIM("lugar_texto")) > 0) NOT VALID;
