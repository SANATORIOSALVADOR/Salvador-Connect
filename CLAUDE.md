# CLAUDE.md — Salvador-Connect (Sanatorio del Salvador)

Sistema interno modular del **Sanatorio del Salvador**.
Stack: **React + Vite** (web) · **Express + TypeScript** (API) · **PostgreSQL + Drizzle** · **Docker Compose**.

Nombre en UI: **Sanatorio del Salvador** (nunca “Sanatorio Salvador” ni solo “Salvador” en títulos de producto).

---

## Cómo trabajar (orden obligatorio)

1. Leer este archivo + `docs/ESTADO_ACTUAL.md` + la skill del módulo si existe (`.claude/skills/`).
2. **Un módulo por vez**. No mezclar Guardias + Inventario + fiscal en el mismo cambio.
3. Orden técnico: **schema** (`packages/db`) → `pnpm run db:push` → **API** (`apps/api`) → **UI** (`apps/web/src/pages/`).
4. Probar (Docker o `dev:api` / `dev:web`) antes de cerrar.
5. **No** commitear secretos, `.env`, tokens GitHub, ni contraseñas.

---

## Módulos — prioridad y estado

| Módulo | Estado | Notas |
|--------|--------|--------|
| **Administración** | Activo / prioritario | Vencimientos, recordatorios, calendario, generar fiscal (reglas locales ARCA) |
| **Guardias Médicas** | Activo / prioritario | Calendario + carga; campos: Sector, Fecha, Inicio, Fin, Modalidad (activa/pasiva). Sin “turno” ni “tipo” |
| **Usuarios / Configuración** | Activo (base) | ABM usuarios, roles, módulos visibles, sectores |
| **Inventario** | Código existe; producto poco definido | No ampliar hasta que el usuario lo pida |
| **Instructivos** | Código existe; producto poco definido | No ampliar hasta pedido |
| **Liquidación** | Placeholder | No implementar lógica |

**Definidos en uso real hoy:** Administración + Guardias Médicas + Usuarios/Config.

---

## Estructura del monorepo

```text
apps/api/                 → Express, rutas, auth cookie
apps/web/src/pages/       → Páginas canónicas de módulos (overlay en Docker build)
packages/db/              → Drizzle schema + push
scripts/patch-shell.mjs   → Shell, sidebar fixed, offset CSS
artifacts/sanatorio-salvador/ → Snapshot UI Replit (NO editar a diario)
Dockerfile                → Multi-stage: copia artifacts → overlay pages → patch-shell
docker-compose.yml
docs/
.claude/skills/           → Skills por dominio para Claude Code
```

### Build web (crítico)

El Dockerfile:

1. Copia `artifacts/sanatorio-salvador` → `apps/web`
2. Overlay de `apps/web/src/pages/{GuardiasMedicas,Administracion,Usuarios,Inventario,Instructivos,Configuracion}.tsx`
3. Ejecuta `scripts/patch-shell.mjs` (sidebar fixed + margin-left del main-column)

**Archivo a editar para un módulo:** `apps/web/src/pages/<Modulo>.tsx`  
Si agregás página nueva: sumarla al `for` del Dockerfile y al wiring de `App.tsx`.

---

## Comandos

```bash
pnpm install
cp .env.example .env

pnpm run db:push
pnpm run dev:api    # :5000
pnpm run dev:web
pnpm run build
pnpm run typecheck

# Server Docker
git fetch && git reset --hard origin/main
docker compose build --no-cache web   # o api web
docker compose up -d --force-recreate
```

---

## Roles

| Rol | Acceso |
|-----|--------|
| `superadmin` | Todo |
| `responsable` | Escritura en sus sectores / módulos asignados |
| `usuario` | Lectura limitada |

Permisos de escritura típicos: `superadmin` o `responsable`.

---

## Auth y API

- Cookie de sesión; `credentials: "include"` en fetch del frontend.
- Rutas bajo `/api/...` (nginx proxy en producción).
- Bootstrap usuario: solo en entornos controlados; **no** hardcodear passwords en docs del repo.

Rutas principales:

- `auth`, `users`, `sectores` / management
- `administracion` (+ `generar-fiscal`)
- `guardias`
- `inventario`, `instructivos` (existentes; no expandir sin pedido)

---

## UI / layout (reglas duras)

1. Sidebar **fixed**, anchos **248px** abierto / **72px** colapsado.
2. `.main-column` debe tener `margin-left` igual al ancho del sidebar (CSS `!important` + inline en patch-shell).
3. Calendarios: grilla **7 columnas** (preferir **inline styles** `display:grid; gridTemplateColumns: repeat(7, ...)` para no depender solo del CSS del build).
4. No reintroducir Clerk, Replit auth, ni dependencias del snapshot viejas.
5. Textos de página no deben quedar debajo del sidebar.

Skills relacionadas: `.claude/skills/layout-ui/SKILL.md`

---

## Fiscal (Administración)

- Generación **local** con reglas del CUIT del sanatorio (no API ARCA real todavía).
- Botón “Generar vencimientos” → modal mes/año.
- Idempotencia por marca en notes `[FISCAL:CODE:YYYY-MM]`.
- Pendiente de producto: integración real ARCA/AFIP (no implementar sin pedido explícito).

Skill: `.claude/skills/administracion/SKILL.md`

---

## Guardias Médicas

Campos de carga:

- Sector: Guardia Central, UTI Neo, UTI UCO, Piso Gineco, Piso Clínica Médica, Residentes
- Fecha, Inicio, Fin
- Modalidad: **activa** | **pasiva**
- Profesional / observaciones según schema

**No** usar campos “turno” ni “tipo” en la UI nueva.

Skill: `.claude/skills/guardias-medicas/SKILL.md`

---

## Criterios de “listo”

- [ ] Listar / crear / editar / borrar con el rol correcto
- [ ] `usuario` no escribe donde no debe
- [ ] Sidebar no tapa títulos ni tablas
- [ ] Calendario legible (7 columnas) si aplica
- [ ] `db:push` si hubo cambio de schema
- [ ] Sin secretos en el commit

---

## No hacer sin pedido explícito

- Integración ARCA/AFIP real
- Upload binario de PDFs en producción
- QR / mantenimientos de inventario
- Lógica de Liquidación
- Reescribir todo el frontend desde cero
- Publicar Postgres en 0.0.0.0

---

## Docs útiles

| Archivo | Contenido |
|---------|-----------|
| `docs/ESTADO_ACTUAL.md` | Qué está en producción de prueba |
| `docs/ALCANCE_MVP.md` | Alcance funcional original |
| `docs/PRODUCCION.md` | Deploy Docker |
| `docs/POSTGRES.md` | DB |
| `AGENTS.md` | Resumen corto para cualquier agente |
| `.claude/skills/*/SKILL.md` | Procedimientos por dominio |
