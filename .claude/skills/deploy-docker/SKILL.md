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

Las migraciones de `packages/db/migrations/` las aplica la API al arrancar (no hace falta db:push).
`bash scripts/db-migrate.sh` reinicia la API y muestra qué aplicó.

## Backups

Servicio `backup` (diario 03 h, 14 días en `./backups`). `scripts/backup-now.sh`, `scripts/restore-backup.sh`.
Ver `docs/BACKUPS_Y_MIGRACIONES.md`.

## Health

```bash
docker compose ps
curl -s http://127.0.0.1:5000/api/health
```

## Proxmox

Mismo stack Docker; secrets y backups fuera del repo.
