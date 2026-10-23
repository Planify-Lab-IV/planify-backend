## Docker

### Levantar el servicio Docker

```
docker compose -f infra/docker-compose.yml up -d
```

### Comprobar status

```
docker compose -f infra/docker-compose.yml ps
```

### Detener servicio

```
docker compose -f infra/docker-compose.yml down
```

---

## Notificaciones push

Las notificaciones push se envían directamente con Firebase Cloud Messaging
(FCM). Se utiliza el proyecto de Firebase **Planify** (`planify-austral`)

El proyecto tiene registrada la aplicación Android con el paquete
`com.planify.planify` y debe mantener habilitada la API **Firebase Cloud
Messaging API (V1)**. La clave clásica de servidor no es compatible con la
integración del backend.

### Variable de producción

El backend lee la cuenta de servicio desde `FIREBASE_SERVICE_ACCOUNT_BASE64`.
La variable vive únicamente en el archivo `.env` de producción de la EC2, en
la raíz del repositorio. El deploy no la reemplaza ni la elimina.

Para crear el valor, descargar una clave privada de cuenta de servicio desde
Firebase: **Configuración del proyecto** → **Cuentas de servicio** →
**Generar nueva clave privada**. Guardar el JSON solamente en el lugar de
secretos del equipo y codificarlo en una sola línea:

```bash
# Linux (incluida la EC2)
base64 -w0 <archivo>.json

# macOS
base64 -i <archivo>.json | tr -d '\n'

# windows
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\Users\TuUsuario\Downloads\planify-xxxxx-firebase-adminsdk-xxxxx.json"))
```

Copiar la salida como el valor de `FIREBASE_SERVICE_ACCOUNT_BASE64` en el
`.env` de producción. Luego, eliminar el JSON descargado de la computadora y
conservar solo la copia gestionada en el lugar de secretos del equipo.

### Rotación de la clave

Para reemplazar una clave de cuenta de servicio sin interrumpir el envío de
notificaciones:

1. Generar una nueva clave privada en Firebase y convertir su JSON a base64.
2. Actualizar `FIREBASE_SERVICE_ACCOUNT_BASE64` en el `.env` de la EC2.
3. Ejecutar un redeploy y comprobar que la API inició correctamente.
4. Recién entonces, borrar la clave anterior en la consola de Firebase.

No borrar la clave anterior antes de confirmar el redeploy: la instancia aún
podría estar ejecutando una versión que la necesita.

### Costo y plan

Firebase Cloud Messaging no tiene costo. El proyecto usa el plan **Spark**,
que no requiere tarjeta. No hace falta ni conviene habilitar el plan **Blaze**
solo para FCM; ese plan se necesita para otros productos de Firebase, como
Cloud Functions.

### Verificación ante fallas

No hay una prueba de punta a punta sin un teléfono que tenga un token de FCM,
pero estas comprobaciones permiten diagnosticar la configuración:

1. En Firebase, verificar que **Firebase Cloud Messaging API (V1)** siga
   habilitada.
2. En la EC2, comprobar que la variable se decodifica a un JSON válido y que
   pertenece al proyecto esperado. El comando muestra solamente `project_id`
   y `client_email`, nunca la clave privada:

   ```bash
   grep '^FIREBASE_SERVICE_ACCOUNT_BASE64=' .env | cut -d= -f2- | base64 -d | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["project_id"], d["client_email"])'
   ```

   El `project_id` debe ser `planify-austral`.

3. Cuando el backend con notificaciones esté desplegado, revisar que valida la
   configuración al iniciar:

   ```bash
   docker logs planify-api
   ```

   Una variable malformada debe impedir que la API inicie. Si hay un error,
   corregir la variable, hacer redeploy y repetir estas comprobaciones.

---

## Almacenamiento de avatares en S3

| Configuración        | Valor                   |
| -------------------- | ----------------------- |
| Bucket               | `planify-avatars-image` |
| Región               | `us-east-2` (Ohio)      |
| Rol de IAM de la EC2 | `planify-backend-ec2`   |
| IMDSv2 hop limit     | `2`                     |

### Variables de entorno

Configurar estas variables en el `.env` de producción de la EC2:

```env
AVATAR_STORAGE=s3
AVATAR_S3_BUCKET=planify-avatars-image
AWS_REGION=us-east-2
```

No se requieren claves de AWS en el código ni en el `.env`: la aplicación usa las credenciales temporales del rol de IAM de la instancia.

### Al crear o reemplazar una EC2

Antes de hacer el deploy, completar estas dos configuraciones en la nueva instancia:

1. Asignar el rol de IAM `planify-backend-ec2`.
2. Configurar el IMDSv2 hop limit en `2`.

El backend se ejecuta dentro de Docker. El hop limit `2` permite que el contenedor obtenga desde IMDSv2 las credenciales temporales del rol de la EC2. Con un hop limit de `1`, las credenciales no alcanzan el contenedor y las fotos dejan de subirse a S3, aunque el código y las variables de entorno no hayan cambiado

---

## Deploy a producción

El deploy se ejecuta automáticamente cuando se hace push a `main`. También puede ejecutarse manualmente desde la pestaña **Actions** de GitHub, usando el workflow **Production Deploy**.

El workflow:

1. Ejecuta el CI del backend.
2. Si el CI pasa, se conecta por SSH a la EC2.
3. Deja el repositorio del servidor en el commit exacto que disparó el workflow.
4. Reconstruye y levanta la imagen con Docker Compose.
5. Espera a que `GET /health` responda correctamente.
6. Si la API no inicia, muestra los logs del contenedor y el workflow falla.

### Secrets de producción

Los datos necesarios para el deploy están configurados en el environment `production` del repositorio, no en el código ni en secrets generales del repositorio.

El environment solo permite deploys desde `main` y contiene:

- `EC2_HOST`: Elastic IP de la instancia.
- `EC2_USER`: usuario SSH de la instancia (`ubuntu`).
- `EC2_SSH_KEY`: clave privada SSH exclusiva del deploy.
- `EC2_KNOWN_HOSTS`: huella SSH verificada de la instancia.

No se deben guardar IPs, claves ni contraseñas en archivos versionados.

### Variables de entorno del servidor

El archivo `.env` de producción sigue viviendo únicamente en la EC2, en la raíz del repositorio. El workflow no lo reemplaza ni lo borra.

Si se agrega una variable de entorno nueva, debe cargarse por SSH en el `.env` de producción antes de mergear a `main` el código que la necesita. Si falta una variable, el deploy puede fallar durante el health check.

Las variables SMTP de recuperación de contraseña son una excepción deliberada: son opcionales mientras `MAIL_TRANSPORT` no sea `smtp`, por lo que PLANIFY-153 puede desplegarse antes de la configuración de la cuenta de correo. Antes de habilitar el envío real, cargar `MAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` y `MAIL_FROM` en el `.env` de la EC2.

### Volver atrás

Para volver a una versión anterior, crear una PR que revierta el commit problemático:

```bash
git revert <commit>
```

Al mergear esa PR en `main`, GitHub Actions ejecutará un nuevo deploy.

Las migraciones de Prisma no se revierten automáticamente. Antes de hacer rollback, verificar si el cambio incluyó migraciones y definir cómo mantener la compatibilidad con la base de datos.

### Rotar la clave de deploy

Si hay que reemplazar la clave SSH usada por GitHub Actions:

1. Generar una nueva clave exclusiva para deploy.
2. Agregar su clave pública a `/home/ubuntu/.ssh/authorized_keys` en la EC2.
3. Actualizar `EC2_SSH_KEY` en el environment `production`.
4. Probar un deploy manual.
5. Eliminar la clave pública anterior de `authorized_keys`.

### Error 137 durante la construcción

Si Docker termina con código de salida `137`, normalmente la instancia se quedó sin memoria durante el build. La EC2 `t3.micro` tiene recursos limitados.

La solución es agregar swap a la instancia y avisar al PM antes de modificar su configuración.
