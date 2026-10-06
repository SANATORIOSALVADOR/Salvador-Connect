# CLAUDE.md — Salvador-Connect (Sanatorio del Salvador)

Sistema interno modular del **Sanatorio del Salvador**.
Stack: **React + Vite** (web) · **Express + TypeScript** (API) · **PostgreSQL + Drizzle** · **Docker Compose**.
Nombre comercial en UI: **Sanatorio del Salvador** (nunca “Salvador” solo en títulos de producto).

---

## Cómo trabajar (orden obligatorio)

1. Leer este archivo + `docs/ALCANCE_MVP.md` + `docs/ESTADO_ACTUAL.md`.
2. Un **módulo por vez**. No mezclar Inventario + Guardias + AFIP en el mismo PR.
3. **Schema DB** (`packages/db`) → `pnpm run db:push` → **API** (`apps/api`) → **UI** (`apps/web`).
4. Probar en Docker o `pnpm run dev:api` / `dev:web` antes de dar por cerrado.
5. No commitear secretos, `.env`, ni tokens.

---

## Estructura del monorepo

```text
apps/api/          → @salvador/api   (Express, rutas, auth)
apps/web/          → @salvador/web   (React + Vite + Tailwind)
packages/db/       → @salvador/db    (Drizzle schema + push)
packages/api-spec/ → OpenAPI (legado parcial)
packages/api-zod/
packages/api-client-react/
scripts/           → patch-shell, prod-up, reset-admin, migraciones
docs/              → arquitectura, producción, alcance
artifacts/         → snapshot UI original Replit (NO editar a diario; el Dockerfile lo copia en build)
lib/               → cliente API legado (build puede copiar a packages/)
Dockerfile         → multi-stage api + web (overlay de páginas custom sobre UI Replit)
docker-compose.yml
```

**Importante en build web:** el Dockerfile copia `artifacts/sanatorio-salvador` → `apps/web` y luego aplica overlay de:
`GuardiasMedicas`, `Administracion`, `Usuarios`, `Inventario`, `Instructivos`, `Configuracion` + `scripts/patch-shell.mjs`.
Si tocás una página de módulo, el archivo canónico a editar es `apps/web/src/pages/<Modulo>.tsx` (queda en el overlay del build).

---

## Comandos

```bash
pnpm install
cp .env.example .env   # completar DATABASE_URL / POSTGRES_*

pnpm run db:push
pnpm run db:seed-sectors   # opcional

pnpm run dev:api           # API :5000
pnpm run dev:web           # Vite dev
pnpm run build
pnpm run typecheck

# Producción / server de prueba
bash scripts/prod-up.sh
# o: docker compose up -d --build
```

Usuario bootstrap típico (solo en entornos controlados): se crea en API al arrancar si no existe. No documentar contraseñas reales en el repo.

---

## Roles y permisos

| Rol | Acceso |
|-----|--------|
| `superadmin` | Todo + ABM usuarios + ABM sectores |
| `responsable` | Escritura en módulos asignados / sectores |
| `usuario` | Lectura / uso según `user_modules` y `user_sectors` |

Módulos de navegación (keys): `dashboard`, `administracion`, `guardias`, `inventario`, `instructivos`, `usuarios`, `configuracion`, `liquidacion` (placeholder).

Escritura ABM Inventario / Instructivos: `superadmin` o `responsable`.
Sectores: solo `superadmin`.

---

## Módulos MVP — estado y reglas

### 1. Fundación (hecho)
Login cookie, layout sidebar colapsable, dashboard, roles/módulos.

### 2. Administración (activo)
- Vencimientos / recordatorios (reemplazo de papel).
- Calendario + listado + ABM.
- Generación fiscal **local** (reglas CUIT del sanatorio, sin API ARCA en vivo todavía).
- Botón **Generar vencimientos** → pide mes/año.
- Pendiente futuro: integración ARCA/AFIP.

### 3. Guardias Médicas (activo)
- **No** usar turnos tipo mañana/tarde/noche en el modelo actual.
- Campos: **sector**, **fecha**, **inicio**, **fin**, **modalidad** (`activa` \| `pasiva`), profesional, observaciones.
- Sectores típicos: Guardia Central, UTI Neo, UTI UCO, Piso Gineco, Piso Clínica Médica, Residentes.
- UI: pestaña **Calendario** + pestaña **Carga y registro**.
- CSS crítico: `.gm-weekdays` y `.gm-grid` con `grid-template-columns: repeat(7, …)`.

### 4. Inventario (activo — activos fijos)
- **No** es stock de consumibles.
- Alta/edición/baja; asignación a sector; historial en `inventory_movements`.
- Categorías: equipo_medico, informatico, mobiliario, infraestructura, otro.
- Estados: activo, en_reparacion, reservado, baja.

### 5. Instructivos (activo)
- Repositorio de metadatos PDF (título, versión, sector, `filePath` = URL o ruta).
- Sin wiki colaborativa. Upload binario: mejora futura.

### 6. Configuración (activo)
- ABM **sectores** (superadmin).
- Usuarios: módulo **Usuarios** (ABM + permisos por módulo/sector).

### 7. Liquidación
- **Placeholder.** No implementar lógica de negocio en el MVP.

---

## Base de datos

- Solo **PostgreSQL** (no Supabase).
- Schema: `packages/db/src/schema/index.ts`.
- Migraciones operativas: `pnpm run db:push` (Drizzle). Scripts SQL en `scripts/` para ajustes puntuales.

---

## API — rutas principales

| Prefijo | Archivo |
|---------|---------|
| `/api/auth/*` | `apps/api/src/routes/auth.ts` |
| `/api/users/*` | `users.ts` |
| `/api/guardias/*` | `guardias.ts` |
| `/api/administracion/*` | `administracion.ts` |
| `/api/inventario/*` | `inventario.ts` |
| `/api/instructivos/*` | `instructivos.ts` |
| `/api/sectores/*` | `sectores.ts` |
| `/api/sectors`, agenda… | `management.ts` |

Auth: cookie de sesión + `requireAuth` / `requireSuperadmin` en `apps/api/src/lib/auth.ts`.

---

## UI / CSS

- Base visual: snapshot Replit en `artifacts/sanatorio-salvador`.
- Estilos de layout y módulos se **inyectan en el Dockerfile** (`CSSEOF` → `index.css`).
- Sidebar fija 248px / colapsada 72px; no debe crecer al cambiar de módulo.
- No depender de Clerk ni paquetes Replit.

---

## Deploy

- Docker Compose: servicios `db`, `api`, `web`.
- Postgres en host: si el puerto 5432 está ocupado, usar `POSTGRES_BIND=127.0.0.1:15432`.
- Migración a **Proxmox**: mismo stack Docker; no requiere reescritura de app.

---

## Prohibido

- Replit packages, Clerk, Supabase.
- Inventario como consumibles/stock.
- Liquidación completa en MVP.
- Contraseñas o tokens en el repo.
- Force-push a `main` sin acuerdo.
- Romper el overlay del Dockerfile (páginas custom deben seguir listadas en el `for f in …`).

---

## Checklist al cerrar una tarea

- [ ] Schema actualizado si hubo tablas nuevas
- [ ] `db:push` documentado o aplicado
- [ ] Rutas API con `requireAuth` y permisos de escritura correctos
- [ ] UI en `apps/web/src/pages/` y nombre en overlay del Dockerfile
- [ ] Sin secretos en el commit
- [ ] Probar listado + alta + edición + baja del ABM tocado
