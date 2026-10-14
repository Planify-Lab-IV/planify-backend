ALTER TABLE "evento"
DROP CONSTRAINT "evento_estado_check";

ALTER TABLE "evento"
    ADD CONSTRAINT "evento_estado_check"
        CHECK ("estado" IN ('active', 'confirmed', 'cancelled')) NOT VALID;