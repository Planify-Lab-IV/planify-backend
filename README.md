# Planify Backend

## Requisitos

- Node.js 22.

## Instalación

Instalar las dependencias con:

```bash
npm install
```

Este es el bootstrap inicial del proyecto. Los comandos de ejecución, configuración de base de datos y Docker se incorporarán en tickets posteriores.

### Migrar prisma

```
npx prisma format
npx prisma validate
npx prisma migrate dev --name init
npx prisma generate

npx prisma studio
```

## Repositorio Mobile

[Planify Mobile](https://github.com/Planify-Lab-IV/planify-mobile)

### Git Flow (convenciones a seguir a la hora de nombrar una branch)

- `feature/PLANIFY-<n>-descripcion` → `develop`
- `release/*` → `main`
- `hotfix/*` → `main`
