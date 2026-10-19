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

El backend se ejecuta dentro de Docker. El hop limit `2` permite que el contenedor obtenga desde IMDSv2 las credenciales temporales del rol de la EC2. Con un hop limit de `1`, las credenciales no alcanzan el contenedor y las fotos dejan de subirse a S3, aunque el código y las variables de entorno no hayan cambiado.
