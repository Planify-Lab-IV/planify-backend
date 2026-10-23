#!/bin/sh
set -e

echo "[Planify Entrypoint] Applying database migrations..."
npx --no-install prisma migrate deploy

echo "[Planify Entrypoint] Starting application..."
exec "$@"
