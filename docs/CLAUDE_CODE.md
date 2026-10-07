# Guía operativa — Claude Code

## Arranque en una máquina nueva

```bash
git clone https://github.com/SANATORIOSALVADOR/Salvador-Connect.git
cd Salvador-Connect
pnpm install
cp .env.example .env
# Completar DATABASE_URL / POSTGRES_*
pnpm run db:push
pnpm run dev:api   # terminal 1
pnpm run dev:web   # terminal 2
```

Abrir el proyecto en Claude Code desde la raíz del repo. Claude lee `CLAUDE.md` automáticamente.

## Skills del proyecto

Ubicación: `.claude/skills/`

| Skill | Cuándo usarla |
|-------|----------------|
| `administracion` | Vencimientos, fiscal, calendario admin |
| `guardias-medicas` | Carga y calendario de guardias |
| `layout-ui` | Sidebar, márgenes, grillas, CSS build |
| `deploy-docker` | Build/up en server Linux |
| `db-schema` | Tablas Drizzle, push, tablas faltantes |
| `usuarios` | ABM usuarios, módulos visibles, roles |

Invocá la skill cuando el pedido del usuario coincida con el dominio.

## Flujo de un ticket típico

1. Confirmar módulo (¿Administración o Guardias?).
2. Cargar skill correspondiente.
3. Cambiar schema solo si hace falta → `db:push`.
4. API en `apps/api/src/routes/`.
5. UI en `apps/web/src/pages/`.
6. Si tocás shell/sidebar → `scripts/patch-shell.mjs`.
7. Probar login + flujo feliz + rol `usuario` sin permiso de escritura.

## Server de prueba (Docker)

```bash
cd ~/salvador-connect   # o ruta del clone
git fetch origin && git reset --hard origin/main
docker compose build --no-cache web    # o api web
docker compose up -d --force-recreate
```

Tablas nuevas:

```bash
# Con db healthy y DATABASE_URL hacia el servicio db
pnpm run db:push
# o el one-liner docker run node + pnpm run db:push en la red compose
```

## Errores frecuentes

| Síntoma | Causa probable | Acción |
|---------|----------------|--------|
| Textos debajo del sidebar | margin-left no aplicado | Revisar patch-shell + CSS OFFSET |
| Calendario en 1 columna | CSS grid no cargó | Inline `gridTemplateColumns: repeat(7,...)` |
| “relation does not exist” | Falta db:push | Ejecutar push |
| Login 500 | DB o hash usuario | Logs api + tabla users |
| Build web falla | Overlay / vite | Logs docker build; no editar artifacts a mano salvo restauración |

## Qué no pedir a Claude sin contexto

- “Rehacer todo el front” — romperá el overlay Replit.
- “Conectar AFIP ya” — pendiente de producto; solo reglas locales.
- Credenciales en el chat público — usar env en el server.
