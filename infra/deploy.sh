#!/usr/bin/env bash
set -euo pipefail

COMPOSE_FILE="infra/docker-compose.prod.yml"
MAX_ATTEMPTS=24
WAIT_SECONDS=5

if [[ ! -f ".env" ]]; then
  echo "Error: falta el archivo .env en la raíz del repositorio. No se modificó el contenedor."
  exit 1
fi

# .env es la fuente de configuración de producción.
# shellcheck disable=SC1091
set -a
source ".env"
set +a

HOST_PORT="${HOST_PORT:-80}"

if ! [[ "$HOST_PORT" =~ ^[0-9]+$ ]] || ((HOST_PORT < 1 || HOST_PORT > 65535)); then
  echo "Error: HOST_PORT debe ser un puerto válido; valor recibido: '$HOST_PORT'."
  exit 1
fi

echo "Reconstruyendo y levantando la API..."
docker compose -f "$COMPOSE_FILE" build --pull
docker compose -f "$COMPOSE_FILE" up -d

echo "Esperando que la API responda en /health..."
healthy=false

for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  if curl --fail --silent --show-error \
    --connect-timeout 2 \
    --max-time 5 \
    "http://localhost:${HOST_PORT}/health" > /dev/null; then
    healthy=true
    break
  fi

  echo "La API todavía no está sana (intento ${attempt}/${MAX_ATTEMPTS})."
  sleep "$WAIT_SECONDS"
done

if [[ "$healthy" != true ]]; then
  echo "Error: la API no respondió correctamente en /health."
  echo "Últimas 200 líneas de logs del contenedor api:"
  docker compose -f "$COMPOSE_FILE" logs --tail 200 api || true
  exit 1
fi

echo "API sana. Eliminando imágenes Docker sin uso..."
docker image prune -f

echo "Deploy completado correctamente."
