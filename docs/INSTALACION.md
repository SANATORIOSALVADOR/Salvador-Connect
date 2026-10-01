# Instalación limpia y segura (server de prueba)

**Server de prueba:** `172.20.1.134`

## Opción A — Un solo comando (recomendado)

En el server Linux:

```bash
# Si no tenés Docker todavía:
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/SANATORIOSALVADOR/Salvador-Connect/main/scripts/install-docker.sh)"

# Cerrar sesión y volver a entrar si te agregó al grupo docker, luego:

git clone https://github.com/SANATORIOSALVADOR/Salvador-Connect.git ~/salvador-connect
cd ~/salvador-connect
bash scripts/install.sh
```

Variables opcionales:

```bash
SERVER_IP=172.20.1.134 WEB_PORT=8080 API_PORT=5000 bash scripts/install.sh
```

## Qué hace el instalador

1. Verifica / usa Docker + Compose
2. Clona o actualiza el repo en `~/salvador-connect`
3. Borra legado `artifacts/` y `lib/` si existen
4. Genera **secrets aleatorios** en `.env.deploy` (chmod 600)
5. Crea `docker-compose.override.yml` con:
   - Postgres **solo en localhost** (`127.0.0.1:5432`)
   - Web en `172.20.1.134:8080`
   - API en `172.20.1.134:5000`
6. `docker compose up -d --build`
7. Aplica schema con `db:push`

## Después de instalar

| URL | Uso |
|-----|-----|
| http://172.20.1.134:8080 | Frontend |
| http://172.20.1.134:5000/api/health | Health API |

Login bootstrap: usuario `sistemas` — **cambiar contraseña al entrar**.

```bash
bash scripts/status.sh
docker compose logs -f
```

## Desinstalar

```bash
bash scripts/uninstall.sh          # para contenedores, conserva DB
bash scripts/uninstall.sh --purge  # borra también el volumen de Postgres
```

## Seguridad (staging)

- Password de Postgres **aleatorio**, no hardcodeado en el repo
- `.env.deploy` y `docker-compose.override.yml` en `.gitignore`
- Postgres no expuesto a la LAN (solo 127.0.0.1)
- Web/API solo en la IP interna del server
- **No es HTTPS todavía** — solo red interna de prueba
- No uses este stack así en Internet público sin TLS y firewall
