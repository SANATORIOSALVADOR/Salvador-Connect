# Estado actual del sistema (octubre 2026)

## Operativo en server de prueba (Docker)

- Login + sesión
- Sidebar colapsable (ancho fijo 248 / 72)
- Dashboard
- **Administración**: listado, calendario, ABM vencimientos, generar vencimientos fiscales
- **Guardias Médicas**: calendario + carga (activa/pasiva, inicio/fin)
- **Inventario**: ABM activos fijos + sector
- **Instructivos**: ABM metadatos PDF
- **Usuarios**: ABM + módulos + sectores
- **Configuración**: ABM sectores
- **Liquidación**: placeholder

## Stack real

| Capa | Tecnología |
|------|------------|
| Web | React 18, Vite, Tailwind (snapshot Replit) |
| API | Express, TypeScript, cookie auth |
| DB | PostgreSQL 16, Drizzle |
| Deploy | Docker Compose (`db`, `api`, `web`) |

## Estructura de código

Monorepo `apps/*` + `packages/*`. El build de web **reconstruye** UI desde `artifacts/sanatorio-salvador` y aplica overlay de páginas en `apps/web/src/pages/`.

## Próximos pasos acordados

1. Estabilizar UI (layout) en todos los módulos.
2. Claude Code para desarrollo continuo módulo a módulo.
3. Migrar el mismo stack a **Proxmox**.
4. DB formal (migraciones versionadas, backups) cuando el producto lo pida.
5. ARCA/AFIP: mantener pendiente; hoy generación local de vencimientos.

## No es deuda de estructura “parte 1/4”

Cualquier texto viejo de “parte 1/4” es histórico. El árbol vigente es el de `apps/` + `packages/`.
