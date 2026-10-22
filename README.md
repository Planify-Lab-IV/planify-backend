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

El envío del código de recuperación está simulado. Con `NODE_ENV=development`, el código de seis dígitos se imprime en la consola del backend para probar el flujo localmente. En producción el código nunca se registra, por lo que el flujo todavía no es usable por una persona final hasta que PLANIFY-153 configure el proveedor de correo.

Cada código vence a los 30 minutos, admite cinco intentos y una cuenta puede solicitar hasta tres códigos por hora.

## Notificaciones push

El backend envía notificaciones a los demás participantes registrados de un evento cuando se crea una tarea, se registra un gasto o se confirma el horario. Las actualizaciones de disponibilidad no generan push. Los participantes anónimos no reciben push porque no registran dispositivos, pero las actividades que generan sí notifican a los demás participantes registrados.

La variable opcional `FIREBASE_SERVICE_ACCOUNT_BASE64` contiene la cuenta de servicio de Firebase como JSON codificado en base64. Si no está configurada, el backend continúa funcionando y solo registra en el log que habría enviado una notificación; no se requieren credenciales de Firebase para desarrollo local.

### Git Flow (convenciones a seguir a la hora de nombrar una branch)

- `feature/PLANIFY-<n>-descripcion` → `develop`
- `release/*` → `main`
- `hotfix/*` → `main`
