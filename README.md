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

## Repositorio Mobile

[Planify Mobile](https://github.com/Planify-Lab-IV/planify-mobile)

## Recuperación de contraseña

En producción, con `MAIL_TRANSPORT=smtp`, el código de recuperación se entrega mediante SMTP. En desarrollo y cuando `MAIL_TRANSPORT` no está configurada, el código de seis dígitos sigue imprimiéndose en la consola para facilitar el desarrollo local.

Cada código vence a los 30 minutos, admite cinco intentos y una cuenta puede solicitar hasta tres códigos por hora.

Para probar SMTP sin usar la cuenta de producción, crear una cuenta de prueba en [Ethereal](https://nodemailer.com/guides/testing-with-ethereal) y copiar sus credenciales SMTP en un `.env` local no versionado:

```env
MAIL_TRANSPORT=smtp
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_USER=<usuario de Ethereal>
SMTP_PASS=<contraseña de Ethereal>
MAIL_FROM=Planify <planify@example.com>
```

Una cuenta personal de Gmail admite hasta 500 destinatarios por día. Junto al límite de tres pedidos por hora por cuenta, alcanza para el MVP.

### Git Flow (convenciones a seguir a la hora de nombrar una branch)

- `feature/PLANIFY-<n>-descripcion` → `develop`
- `release/*` → `main`
- `hotfix/*` → `main`
