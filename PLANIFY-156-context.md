# PLANIFY-156 — Contexto de implementación

Este documento concentra las decisiones, el trabajo realizado y lo pendiente
del ticket **PLANIFY-156: Reporte diario automático de KPIs a Lab4 KPIs**.
Sirve para retomar la tarea sin reconstruir el razonamiento ni el flujo del
reporter.

## Estado actual

- Rama: `feature/PLANIFY-156-reporte-diario-kpis`.
- La rama se creó desde `develop`, no desde `fix`, para conservar la base que
  pedía el ticket.
- El trabajo se realizó en el worktree
  `C:\Users\lubet\projects\planify\planify-backend-156`, separado del
  checkout original que tenía cambios ajenos.
- Último commit de implementación: `f52dbdd fix(kpis): conservar evidencia
ante fallas de Lab4`.
- La parte de backend y la mayor parte del reporter ya están implementadas.
- Aún faltan el registro remoto del catálogo, la configuración de GitHub,
  el workflow programado, la prueba real contra Lab4 y la documentación
  operativa final.

## Objetivo del ticket

Planify debe reportar diariamente diez KPIs reales a Lab4 KPIs. El reporter
corre fuera del backend, obtiene datos de tres fuentes y publica un único lote:

```text
PostgreSQL + métricas HTTP ─┐
GitHub Actions ────────────┼─> reporter TypeScript ─> Lab4 KPIs
GET /health ───────────────┘
```

La regla esencial es: **un cero es válido solo cuando una fuente respondió y
el contador real fue cero**. Si una fuente falla, no se inventa un valor; se
publican los grupos de KPIs que sí se pudieron medir y la ejecución queda en
falla para que sea visible.

## Los diez KPIs acordados

| Fuente         | KPI                                       |
| -------------- | ----------------------------------------- |
| Backend        | `events_created_month_to_date`            |
| Backend        | `events_with_multiple_participants_count` |
| Backend        | `events_with_activity_count`              |
| Backend        | `http_requests`                           |
| Backend        | `http_5xx_responses`                      |
| Backend        | `http_response_time_total_ms`             |
| GitHub Actions | `ci_runs_last_7_days`                     |
| GitHub Actions | `ci_successful_runs_last_7_days`          |
| Health probe   | `health_checks_total`                     |
| Health probe   | `health_checks_successful`                |

La definición compartida está en `kpi-reporter/catalog.ts`. Incluye ID,
categoría, unidad, fuente y descripción; es la única fuente de verdad del
catálogo local.

## Decisiones de diseño tomadas

### Día de medición en Argentina

- Se agregó `src/shared/time/argentina-date.ts`.
- `getArgentinaDay(now)` obtiene el día de calendario en
  `America/Argentina/Buenos_Aires`.
- `getArgentinaDayRange(day)` calcula su inicio y fin en UTC para consultas a
  la base.
- No se usa `toISOString().slice(0, 10)`: el workflow corre a las 00:15 UTC,
  cuando en Argentina todavía corresponde el día anterior.
- La utilidad no depende de configuración ni de Prisma. El reporter puede
  importarla sin arrastrar la validación de `DATABASE_URL` o `JWT_SECRET`.

### Métricas HTTP persistentes

- Se agregó el modelo Prisma `HttpDailyMetric` y su migración.
- Hay una fila por día argentino con cantidad de requests, cantidad de 5xx y
  suma de duraciones.
- La duración acumulada se persiste como `BigInt`, porque un `Int` podría
  desbordar si se acumulan suficientes milisegundos en un día.
- Al exponerla por JSON se convierte a `number`, ya que `BigInt` no es
  serializable por `res.json()`.
- Los incrementos se acumulan en memoria mediante
  `createHttpMetricsAccumulator()` y se escriben periódicamente; también se
  hace un `flush` seguro al recibir `SIGTERM`. Esto evita escribir en la base
  por cada request sin perder métricas al detener el contenedor.

### Middleware HTTP

- `createHttpMetricsMiddleware()` se registra en `src/app.ts` **antes** de las
  rutas. De ese modo observa todas las respuestas finales.
- Mide el tiempo con `process.hrtime.bigint()` y registra al evento
  `res.on("finish")`, cuando ya se conoce el status final, incluso para 500
  producidos por el error handler.
- Excluye `GET /health`, `GET /internal/kpis` y las rutas que terminan en el
  404 del router. Así los sondeos propios y el tráfico de bots no inflan las
  métricas de producto.

### Endpoint interno de KPIs

- Se implementó `GET /internal/kpis?date=D`.
- Está protegido por `X-Internal-Token`, que se compara contra
  `INTERNAL_KPIS_TOKEN`.
- Devuelve los tres KPIs de negocio y los tres HTTP para el día pedido.
- Las consultas de negocio cuentan eventos creados en la ventana mensual del
  día reportado, sin filtrar eventos cancelados.
- Los KPIs basados en participantes y actividad son una foto de las relaciones
  persistidas al momento de consultar; no pretenden reconstruir una foto
  histórica exacta de relaciones que no tienen auditoría.

### Reporter separado del backend

- Todo el reporter vive en `kpi-reporter/` y se ejecuta con
  `npm run kpis:report` usando Node 22 y `tsx`.
- No inicia Express ni Prisma; consulta al backend por HTTP mediante el
  endpoint interno protegido.
- Las fuentes viven separadas en `kpi-reporter/sources/`:
  `backend.ts`, `github-actions.ts` y `health.ts`.
- Las dependencias de red y el reloj se pueden inyectar (`fetchImpl`, `now`,
  `sleep`) para obtener tests rápidos y deterministas, sin llamadas reales ni
  esperas de treinta segundos.

### Obtención de datos

- Backend: consulta `/internal/kpis` con `X-Internal-Token`.
- CI: consulta las corridas completadas de `ci.yml` de `planify-backend` y
  `planify-mobile`, pagina resultados y no mezcla deploys ni el propio
  reporter. Los exitosos son los que tienen `conclusion === "success"`.
- Salud: realiza diez requests a `/health`, separados por treinta segundos y
  con timeout de cinco segundos. Un timeout o un 503 cuentan como intento
  real, pero no como éxito.

### Validación antes de publicar

- Las estructuras compartidas viven en `measurements.ts`.
- `validation.ts` valida fecha, ambiente, `run_id`, valores enteros finitos no
  negativos, IDs conocidos y ausencia de repetidos.
- Cuando las tres fuentes respondieron, exige exactamente los diez IDs.
- Cuando una fuente falla, permite un lote parcial solamente si contiene el
  grupo completo de cada fuente disponible. Por ejemplo, no permite enviar
  solo uno de los dos KPIs de CI.
- También valida las relaciones:
  `http_5xx_responses <= http_requests`,
  `ci_successful_runs_last_7_days <= ci_runs_last_7_days` y
  `health_checks_successful <= health_checks_total`.

### Publicación y verificación en Lab4

- `lab4-client.ts` hace el POST a `measurement` con
  `on_conflict=project_id,kpi_id,date,env` y
  `Prefer: resolution=ignore-duplicates`.
- Luego hace un GET de verificación para confirmar que Lab4 persistió los IDs
  enviados.
- Si Lab4 conserva un valor previo por idempotencia, se registra un warning;
  no se falla porque una medición aceptada no se puede corregir.
- Si falta un KPI en la verificación, la ejecución falla.
- Los errores HTTP de Lab4 usan `Lab4ResponseError`, que conserva el status
  para incluirlo en la evidencia sin exponer secretos.

### Evidencia de la corrida

- `artifact.ts` escribe un JSON por corrida con fecha, ambiente, `run_id`,
  mediciones, status HTTP y diferencias de valor.
- Nunca guarda headers ni credenciales.
- El artifact se escribe tanto en éxito como en fallas de fuentes, validación,
  POST o verificación de Lab4.
- Ante un error HTTP de Lab4 se conserva su status en el artifact, incluso si
  el fallo ocurrió después de un POST exitoso, durante el GET de verificación.

### Ambientes

- El reporter diario actualmente permite publicar solo a `dev` o `prod`.
- `qa` existe en el tipo compartido porque Lab4 maneja los tres ambientes,
  pero no es un destino del workflow diario de este ticket.
- El futuro script manual de registro de catálogo sí debe aceptar `dev`, `qa`
  y `prod`, porque el ticket pide registrar el catálogo en los tres.

## Fases ejecutadas

| Commit    | Resultado                                          |
| --------- | -------------------------------------------------- |
| `ae424bf` | Utilidades de fecha argentina.                     |
| `c642aae` | Modelo y repositorio para métricas HTTP diarias.   |
| `a3f5058` | Acumulador en memoria de deltas HTTP.              |
| `22b55c5` | Middleware que registra al finalizar la respuesta. |
| `a20502b` | Flush periódico y apagado seguro.                  |
| `3a9b9e9` | Token de autenticación para consultas internas.    |
| `43dbe09` | Consultas de negocio para los KPIs.                |
| `14fb465` | Endpoint interno para el reporter.                 |
| `06a939a` | Catálogo compartido de los diez KPIs.              |
| `69b4471` | Fuente de GitHub Actions.                          |
| `208a218` | Fuente de backend.                                 |
| `2153dc3` | Fuente de salud.                                   |
| `3b294c0` | Tests de límites de las fuentes.                   |
| `594f5db` | Contratos de mediciones.                           |
| `0daaae4` | Validación previa de lotes.                        |
| `85ed109` | Cliente de envío y verificación de Lab4.           |
| `75d64da` | Artifact seguro de la corrida.                     |
| `e1eac79` | Orquestación end-to-end del reporter.              |
| `f52dbdd` | Manejo y cobertura de fallas de Lab4.              |

## Verificación realizada

El conjunto focalizado del reporter tiene actualmente 36 tests que cubren:

- las tres fuentes y sus respuestas inválidas o incompletas;
- el catálogo y la validación de lotes completos y parciales;
- publicación y verificación contra Lab4;
- artifacts sin secretos;
- reporter completo, errores de fuentes, fallas de validación, errores HTTP
  de POST y GET, respuestas de verificación malformadas, diferencias
  idempotentes y fechas pasadas o futuras.

En la última verificación se ejecutaron correctamente:

```text
npx vitest run test/kpi-reporter
npx eslint kpi-reporter test/kpi-reporter
npx prettier --check kpi-reporter test/kpi-reporter package.json
npx tsc --noEmit ...
git diff --check
```

## Pendiente: registro remoto del catálogo

Esta es la siguiente fase. No envía mediciones: registra las definiciones de
los diez IDs en Lab4 para cada ambiente.

### Diseño acordado

Crear `kpi-reporter/register-catalog.ts` y un cliente específico, por ejemplo
`kpi-reporter/catalog-client.ts`.

El flujo será:

1. Leer `KPI_TARGET_ENV`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y
   `PROJECT_KEY` desde la terminal local.
2. Llamar a `POST /rest/v1/rpc/current_project`.
3. Cortar antes de cualquier escritura si el ambiente asociado a la clave no
   coincide con `KPI_TARGET_ENV`.
4. Leer los IDs existentes con `GET /rest/v1/kpi_catalog`.
5. Compararlos contra `KPI_CATALOG`.
6. Hacer POST solamente de las definiciones faltantes.
7. Terminar exitosamente sin POST si todas ya existían.

El script será manual e idempotente: no renombra, actualiza, borra ni marca
como deprecado un KPI remoto. Cambiar o retirar una definición existente es
una decisión puntual, fuera de este script.

### Información que falta antes de implementarlo

El ticket indica los endpoints, pero no fija el JSON exacto de:

- la respuesta de `current_project`;
- la respuesta de `kpi_catalog`;
- el payload requerido para crear una definición de KPI.

Hay que confirmarlo en la documentación, ejemplos o credenciales provistas por
la cátedra antes de escribir el cliente. No se deben adivinar esos contratos.

### Tests previstos

- Ambiente correcto y catálogo vacío: crea diez definiciones.
- Algunos IDs existentes: crea solo los faltantes.
- Catálogo completo: no hace POST.
- Ambiente de la clave distinto: falla antes de consultar o crear.
- Respuestas HTTP o JSON inválidos: falla con un error claro.
- Segunda ejecución: no duplica ni modifica nada.

## Próximos pasos del ticket

1. Conseguir las credenciales de Lab4:
   `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` y una `PROJECT_KEY` por
   ambiente. La clave no se pega en el repositorio ni en el chat.
2. Confirmar el contrato de API y desarrollar/probar `register-catalog.ts`.
3. Registrar manualmente el catálogo en `dev`; luego en `qa`; registrar `prod`
   únicamente después de validar el flujo completo en dev.
4. Configurar los entornos de GitHub `kpis-dev` y `kpis-prod`:
   `PROJECT_KEY` e `INTERNAL_KPIS_TOKEN` como secrets; URL pública, clave
   publicable y URL del backend como variables. Restringir `kpis-prod` a la
   rama `develop`.
5. Crear el workflow diario. Debe ejecutar con Node 22, `npm ci`,
   `npm run kpis:report`, recibir `GITHUB_TOKEN`, conservar el artifact con
   `if: always()` y permitir `workflow_dispatch` para pruebas manuales.
6. Configurar el cron a las 21:15 ART (00:15 UTC) y la alerta que abre un issue
   si falla. El schedule solo se ejecutará cuando el workflow esté en la rama
   por defecto (`develop`).
7. Desplegar el backend con `INTERNAL_KPIS_TOKEN` configurado en la EC2 y
   validar `/internal/kpis` mediante `curl` antes de la primera corrida.
8. Probar manualmente el workflow en `dev`, revisar los diez valores en Lab4
   y relanzarlo para el mismo día para probar idempotencia.
9. Después del merge a `develop` y de registrar el catálogo de producción,
   habilitar la operación programada en prod.
10. Documentar la operación en `infra/README.md`: KPIs y fuentes, horario,
    secrets y variables sin valores, relanzamiento manual y respuesta ante la
    alerta.

## Riesgos a recordar

- Una clave de producción usada accidentalmente desde una configuración de dev
  puede registrar definiciones en el ambiente incorrecto. La comprobación de
  `current_project` es obligatoria.
- Una fuente caída no debe producir un cero. El reporter ya distingue ambos
  casos; el workflow debe preservar artifact y marcar la corrida como fallida.
- El registro de catálogo debe correr desde la terminal local, nunca como paso
  automático diario.
- Los secretos no deben aparecer en commits, artifacts, logs ni ejemplos.
- La primera prueba de producción debe esperar a que dev haya validado el lote
  completo y la idempotencia.
