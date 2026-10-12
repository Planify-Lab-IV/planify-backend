-- CreateTable
CREATE TABLE "metricas_http_diarias" (
    "fecha" DATE NOT NULL,
    "cantidad_requests" INTEGER NOT NULL DEFAULT 0,
    "cantidad_respuestas_5xx" INTEGER NOT NULL DEFAULT 0,
    "suma_tiempos_respuesta_ms" BIGINT NOT NULL DEFAULT 0,

    CONSTRAINT "metricas_http_diarias_pkey" PRIMARY KEY ("fecha")
);
