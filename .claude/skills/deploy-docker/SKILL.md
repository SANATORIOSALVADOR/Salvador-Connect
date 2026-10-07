---
name: deploy-docker
description: Despliegue Docker Compose de Salvador-Connect en Linux de prueba o producción. Usar para build, up, db:push en contenedores, puertos, salud de api/db/web.
---

# Skill — Deploy Docker

## Servicios

- `db` — PostgreSQL 16
- `api` — Node, puerto interno 5000
- `web` — nginx estático + proxy `/api`

## Actualizar código en el server

```bash
cd ~/salvador-connect
git fetch origin
git reset --hard origin/main
docker compose build --no-cache web
docker compose up -d --force-recreate
```

## Schema / tablas nuevas

Con `db` healthy, `pnpm run db:push` usando `DATABASE_URL` hacia el host `db` en la red Compose.

No publicar 5432 en 0.0.0.0 si el host ya tiene Postgres.

## Health

```bash
docker compose ps
curl -s http://127.0.0.1:5000/api/health
```

## Proxmox

Mismo stack Docker; secrets y backups fuera del repo.
