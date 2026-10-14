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

Agregaría esta sección debajo de `## Docker` en `infra/README.md`:

````md
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

### Volver atrás

Para volver a una versión anterior, crear una PR que revierta el commit problemático:

```bash
git revert <commit>
```
````

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
