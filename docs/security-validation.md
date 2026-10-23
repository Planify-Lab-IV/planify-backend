# Seguridad y validación del contenedor

## Baseline de Node

Las etapas `builder` y `runner` usan la imagen inmutable por versión
`node:22.23.4-alpine`. Esta era la última versión publicada de la línea 22 el
22 de octubre de 2026 y contiene los parches de seguridad publicados el 21 de
octubre. `.nvmrc` y los workflows de GitHub Actions usan la misma versión.

`infra/deploy.sh` ejecuta `docker compose build --pull` antes de levantar el
servicio: aunque la versión de Node está fijada, Docker consulta la imagen base
en cada despliegue y no reutiliza silenciosamente un tag local obsoleto.

## Prisma en Alpine

El contenedor instala `openssl` y `libc6-compat` en ambas etapas. `openssl` es
necesario para que los engines de Prisma para Alpine funcionen; `libc6-compat`
mantiene la compatibilidad con dependencias nativas. Prisma se conserva como
dependencia de producción porque el entrypoint ejecuta `prisma migrate deploy`
después de `npm prune --omit=dev`. El entrypoint usa `npx --no-install`, por lo
que una imagen de producción no descarga paquetes al arrancar.

## Auditoría npm

El informe inicial mencionaba 12 paquetes afectados. Tras una instalación
limpia con el lockfile, el informe reproducible mostraba tres hallazgos: Vite y
`@vitest/mocker`/Vitest. Todos eran dependencias de desarrollo, alcanzables
solo al ejecutar el runner de pruebas; no se copian a la imagen tras
`npm prune --omit=dev`. No obstante, se actualizaron de forma compatible a
Vitest 4.1.12 y Vite 8.3.5 mediante el rango semver existente, sin
`npm audit fix --force` ni `overrides` mayores.

`npm audit` y `npm audit --omit=dev` terminan sin vulnerabilidades con el
lockfile actualizado. No quedan hallazgos pendientes reportados por npm.

El paquete crítico histórico `proxy-addr@2.0.7` no está presente: el lockfile
resuelve `proxy-addr@2.0.8`. Los demás nombres del informe inicial deben
reevaluarse contra el lockfile, no tratarse como vulnerabilidades explotables
de la API por su sola aparición transitiva.

## Incidencia de `npm audit fix`

Se ejecutó `npm audit fix --dry-run` sin modificar el lockfile tanto con npm
11.20.0 local como con npm 10.9.9 en `node:22.23.4-alpine`. No reprodujo
`Cannot read properties of null (reading 'edgesOut')`. Antes de la corrección,
el modo dry-run proponía 17 actualizaciones compatibles dentro de Vitest/Vite y
sus dependencias; se aplicaron explícitamente con `npm install`, conservando el
lockfile. Si el error reaparece en otro entorno, debe registrarse la versión de
npm y el lockfile exacto antes de intentar recrearlo; no es necesario borrar el
lockfile como primera medida.

## Validación realizada

Se ejecutaron correctamente `npm ci`, `npm run build`, `npm run lint` y `npm
test` (71 archivos y 641 pruebas). También se construyó la imagen con
`docker build --pull`; se verificaron Node 22.23.4, OpenSSL 3.5.9 y la ausencia
de Vitest tras la poda de dependencias de desarrollo.

Finalmente se levantaron en una red aislada una API y PostgreSQL 16 efímeros.
El entrypoint aplicó las 24 migraciones y `GET /health` respondió
`{"status":"ok","database":"connected"}`. Ambos contenedores y la red se
eliminaron al finalizar la prueba; no se ejecutaron migraciones ni despliegues
en producción.
