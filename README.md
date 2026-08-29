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

## Repositorio Mobile

[Planify Mobile](https://github.com/Planify-Lab-IV/planify-mobile)

### Git Flow (convenciones a seguir a la hora de nombrar una branch)

- `feature/PLANIFY-<n>-descripcion` → `develop`
- `release/*` → `main`
- `hotfix/*` → `main`
