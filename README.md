# Planify Backend

## Requisitos

- Node.js 22.

## Instalación

Instalar las dependencias con:

```bash
npm install
```

Este es el bootstrap inicial del proyecto. Los comandos de ejecución, configuración de base de datos y Docker se incorporarán en tickets posteriores.

### Migrar Prisma

```
npx prisma format
npx prisma validate
npx prisma migrate dev --name init
npx prisma generate

npx prisma studio
```

## Iniciar Aplicacion

### Comandos

| Comando                | Descripción                     |
| ---------------------- | ------------------------------- |
| `npm run dev`          | Desarrollo con hot-reload       |
| `npm run build`        | Compilar TypeScript             |
| `npm run start`        | Ejecutar en producción          |
| `npm run test`         | Correr tests                    |
| `npm run lint`         | Verificar lint                  |
| `npm run format`       | Formatear código                |
| `npm run format:check` | Verificar formato sin modificar |
| `npm run db:seed`      | Poblar DB con dev_users         |

#### Credenciales de Desarrollo

| Nombre | Email              | Contraseña    |
| :----- | :----------------- | :------------ |
| `dev1` | `dev1@planify.dev` | `DevPass123!` |
| `dev2` | `dev2@planify.dev` | `DevPass123!` |
| `dev3` | `dev3@planify.dev` | `DevPass123!` |

## Asistencia de participantes

Un participante puede responder su propia asistencia con un token de usuario registrado o
con el token de sesión de un participante anónimo. El evento debe estar activo.

```bash
curl -X PUT "http://localhost:<PORT>/events/<eventId>/participants/me/attendance" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"state":"confirmed"}'
```

El cliente no envía un `participantId`: el backend identifica al participante desde el token.
Para un usuario registrado lo resuelve por `eventId + userId`; para un participante anónimo usa
el `participantId` incluido en su sesión. Ambas respuestas exitosas devuelven `200` y el
participante actualizado, incluyendo `attendanceState`.

```json
{
  "id": "<participantId>",
  "eventId": "<eventId>",
  "username": "Gil",
  "isAnonymous": true,
  "isOrganizer": false,
  "attendanceState": "confirmed"
}
```

### Rechazar asistencia

```bash
curl -X PUT "http://localhost:<PORT>/events/<eventId>/participants/me/attendance" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"state":"rejected"}'
```

Respuesta `200`:

```json
{
  "id": "<participantId>",
  "eventId": "<eventId>",
  "username": "Gil",
  "isAnonymous": true,
  "isOrganizer": false,
  "attendanceState": "rejected"
}
```

`not_confirmed` es el estado inicial y no puede enviarse manualmente. Por ejemplo, este
request devuelve `400`:

```bash
curl -X PUT "http://localhost:<PORT>/events/<eventId>/participants/me/attendance" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"state":"not_confirmed"}'
```

Respuesta `400`:

```json
{
  "error": "INVALID_DATA",
  "message": "El estado de asistencia es inválido"
}
```

Una sesión anónima debe seguir siendo válida: el participante tiene que existir, pertenecer al
evento del token y el evento debe estar activo. Si no se cumple alguna de esas condiciones, el
endpoint responde `401`.

## Repositorio Mobile

[Planify Mobile](https://github.com/Planify-Lab-IV/planify-mobile)

### Git Flow (convenciones a seguir a la hora de nombrar una branch)

- `feature/PLANIFY-<n>-descripcion` → `develop`
- `release/*` → `main`
- `hotfix/*` → `main`
