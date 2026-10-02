# Producción — Linux + Docker → Proxmox

## Fase actual: server de prueba (Docker)

**IP ejemplo:** `172.20.1.134`

### 1. Una sola vez en el server

```bash
cd ~/salvador-connect   # o: git clone https://github.com/SANATORIOSALVADOR/Salvador-Connect.git ~/salvador-connect
cd ~/salvador-connect
git pull
chmod +x scripts/*.sh
bash scripts/prod-up.sh
```

Eso crea `.env`, buildea, levanta Postgres + API + Web y aplica el schema.

### 2. Probar

- Web: `http://172.20.1.134:8085` (o el puerto de `WEB_BIND`)
- Login: `sistemas` → **cambiar contraseña**
- Módulos: Resumen, Administración (Agenda), Usuarios operativos; resto accesible (placeholders Tramo 1)

### 3. Comandos útiles

```bash
docker compose ps
docker compose logs -f api
docker compose logs -f web
bash scripts/db-migrate.sh
docker compose restart
```

### Seguridad staging

- Postgres y API solo en `127.0.0.1` por defecto
- Web expuesto en LAN vía `WEB_BIND`
- Password DB aleatorio en `.env` (no en git)
- Sin HTTPS todavía (red interna)

---

## Fase siguiente: Proxmox + Claude Code

Cuando terminen las pruebas en este server:

1. **Claude Code** — completar módulos (Guardias, Inventario, Instructivos PDF)
2. **Proxmox** — VM o CT Linux con el mismo `docker compose`
3. Ajustar `.env` (passwords, `WEB_BIND`, más adelante TLS con reverse proxy)
4. Backups del volumen `pgdata`

Misma estructura de repo; no hace falta reescribir el stack.

---

## Qué está “listo para producción” hoy vs qué no

| Listo (staging) | Pendiente (Claude / tramos) |
|-----------------|-----------------------------|
| Docker Compose prod | Guardias CRUD completo |
| API auth + agenda + users | Inventario activos fijos UI/API |
| UI Replit (login, shell, agenda, users) | Instructivos PDF |
| Postgres + migraciones | HTTPS / dominio |
| Scripts deploy | Backups automatizados |
