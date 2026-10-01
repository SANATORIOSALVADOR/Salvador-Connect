# Arquitectura — Salvador-Connect

## Enfoque

**Monolito modular** en monorepo pnpm.

- Un solo despliegue inicial.
- Separación clara por dominio (API, DB, cliente).
- Posibilidad de extraer módulos a servicios independientes más adelante.

## Capas

```
┌─────────────────────────────────────────┐
│  Frontend (React)                       │
│  artifacts/mockup-sandbox + app real    │
└─────────────────┬───────────────────────┘
                  │ HTTP / JSON
┌─────────────────▼───────────────────────┐
│  API Server (Express 5)                 │
│  artifacts/api-server                   │
│  - Auth (sesiones + scrypt)             │
│  - Routes por dominio                   │
│  - Middlewares de permisos              │
└─────────────────┬───────────────────────┘
                  │ Drizzle ORM
┌─────────────────▼───────────────────────┐
│  PostgreSQL                             │
│  lib/db (schema + migrations vía push)  │
└─────────────────────────────────────────┘
```

## Paquetes compartidos

| Paquete | Responsabilidad |
|---------|-----------------|
| `@workspace/db` | Schema Drizzle, conexión PG |
| `@workspace/api-spec` | OpenAPI |
| `@workspace/api-zod` | Validación de request/response |
| `@workspace/api-client-react` | Hooks tipados para el frontend |

## Auth

- Cookie `sanatorio_session` (httpOnly, SameSite=Lax).
- Hash de contraseña: scrypt.
- Bootstrap de superadmin `saceliz` en el primer arranque.
- Permisos por rol + módulos asignados + sectores asignados.

## Principios

1. **Control por sector** — filtro automático excepto Admin General.
2. **Simplicidad primero** — MVP prioriza carga rápida y consulta clara.
3. **Trazabilidad** — movimientos de activos y creación de guardias quedan registrados.
4. **Extensibilidad** — estructura preparada para mantenimientos, QR, integraciones y Liquidación.

## Despliegue objetivo

- Contenedor/VM aplicación (Node).
- Contenedor/VM o servicio PostgreSQL separado.
- Reverse proxy (Nginx/Caddy) si es necesario.
- Variables de entorno: `DATABASE_URL`, `NODE_ENV`, etc.
