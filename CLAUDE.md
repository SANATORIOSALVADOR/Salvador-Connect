# CLAUDE.md — Salvador-Connect (Sanatorio del Salvador)

Sistema interno modular del **Sanatorio del Salvador**.
Stack: **React + Vite** (web) · **Express + TypeScript** (API) · **PostgreSQL + Drizzle** · **Docker Compose**.

Nombre en UI: **Sanatorio del Salvador** (nunca “Sanatorio Salvador” ni solo “Salvador” en títulos de producto).

---

## Cómo trabajar (orden obligatorio)

1. Leer este archivo + `docs/ESTADO_ACTUAL.md` + la skill del módulo si existe (`.claude/skills/`).
2. **Un módulo por vez**. No mezclar Guardias + Inventario + fiscal en el mismo cambio.
3. Orden técnico: **schema** (`packages/db`) → **migración SQL** en `packages/db/migrations/` (idempotente; la API la aplica al arrancar) → **API** (`apps/api`) → **UI** (`apps/web/src/pages/`). Ver `docs/MIGRACIONES.md`.
4. Probar (Docker o `dev:api` / `dev:web`) antes de cerrar.
5. **No** commitear secretos, `.env`, tokens GitHub, ni contraseñas.

---

## Módulos — prioridad y estado

| Módulo | Estado | Notas |
|--------|--------|--------|
| **Administración** | Activo / prioritario | Agenda, fiscal (calendario oficial + estimadas), cheques, documentos, tareas, recurrentes, contactos |
| **Medical → Guardias Médicas** | Activo / prioritario | Grupo «Medical» del menú (con Cancelaciones Médicos). Calendario + carga; campos: Sector, Fecha, Inicio, Fin, Modalidad (activa/pasiva). Sin “turno” ni “tipo” |
| **Medical → Cancelaciones Médicos** | Activo | Pedidos de cancelación de agenda de consultorio por QR (formulario público `/cancelar-agenda`, número de trámite CAN-0001 + DNI), regla de 15 días hábiles (menos = excepcional con justificación), bandeja para aceptar / rechazar. Sin adjuntos. Skill `.claude/skills/cancelaciones/SKILL.md` |
| **Configuración** | Activo (rediseñada oct-2026) | Menú lateral: **Accesos** (Personas con ficha y alta guiada, Perfiles, Matriz de accesos) · **Estructura** (Sectores, Módulos: activar/desactivar para todos) · Etiquetas de Guardias · **Sistema** (Apariencia, Auditoría). Código en `apps/web/src/pages/configuracion/`. Solo superadmin |
| **Inventario** | Activo | Equipos por planta/sector (PLANTA, SECTOR, RUBRO, TIPO, DESCRIPCION, MARCA, CODIGO DE SERIE), registro de controles / fallas / reparaciones, plan de controles, importar / exportar Excel. Skill `.claude/skills/inventario/SKILL.md` |
| **Instructivos** | **Próximamente**; código viejo en `pages/Instructivos.tsx` | No ampliar hasta pedido |
| **Liquidación** | **Próximamente** | No implementar lógica |

**Definidos en uso real hoy:** Administración + Guardias Médicas + Cancelaciones Médicos + Inventario + Usuarios/Config.

---

## Estructura del monorepo

```text
apps/api/                 → Express, rutas, auth cookie
apps/web/                 → React + Vite: proyecto normal (fuente única de la web)
apps/web/src/App.tsx      → Rutas, shell (menú lateral, barra superior), login
apps/web/src/pages/       → Páginas de módulos (+ subcarpetas guardias/, shared/)
packages/db/              → Drizzle schema + push
packages/api-client-react → Cliente React Query de la API
Dockerfile                → Multi-stage: api (esbuild) y web (vite build) → nginx
docker-compose.yml
docs/
.claude/skills/           → Skills por dominio para Claude Code
```

### Build web

`apps/web` es un proyecto Vite normal: lo que está en el repo es exactamente lo que se publica.
`pnpm dev:web` levanta la web en :5173 con `/api` apuntando a la API local (`API_URL` para otra).
El Docker solo hace `pnpm --filter @salvador/web run build` y sirve `dist/` con nginx.

(Oct-2026: se eliminó el armado viejo — snapshot de Replit en `artifacts/`, overlay de páginas y
`scripts/patch-shell.mjs`. Quedan en el historial de git.)

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

## Roles y permisos

| Tipo | Acceso |
|------|--------|
| `superadmin` | Todo + Configuración (usuarios y sectores) |
| `usuario` | Un nivel por módulo: **Ver** · **Cargar y editar** · **Control total** (o sin acceso) |

- Ver = consultar (GET). Cargar y editar = crear / modificar. Control total = eliminar y configurar el módulo.
- **Acciones concretas** por módulo (`apps/api/src/lib/acciones.ts`, espejo en `apps/web/src/lib/permisos.ts → ACCIONES`):
  el nivel es un atajo que marca las acciones típicas; se pueden sumar o quitar (`user_modules.acciones`, `perfiles.acciones`).
- API: Guardias y Administración usan `requireModuleAccess("<modulo>", { porRuta: true })` y **cada ruta de escritura**
  declara `requireAccion("<modulo>", "<accion>")`. Al agregar una ruta nueva, agregarle su acción (y a ACCIONES si es nueva).
- **Alcance por sector, por módulo** (módulos con sectores: guardias, inventario, instructivos):
  `todos` · `carga` (ve todo, trabaja en sus sectores) · `sector` (ve y trabaja solo en sus sectores).
  Se guarda en `user_modules.alcance` + `user_modules.sector_ids`. API: `visibleSectorIds`, `ownSectorIds`,
  `canSeeSector`, `canWriteSector` en `lib/auth.ts`. **Toda lectura** de datos con sector debe filtrar por `visibleSectorIds`.
- **Perfiles** (`perfiles`, migración 0007): módulos + nivel + tipo de alcance. `users.perfil_id` vincula; la persona hereda
  los cambios. En `user_modules` con perfil: `level = 'perfil'` (hereda, guarda sus sectores), `'ninguno'` o un nivel (excepción).
  Permisos efectivos: `efectivos()` en `lib/auth.ts`.
- **Vencimientos**: `users.acceso_hasta` (vencida = no entra) y `user_modules.hasta` (permiso temporario; vencido se ignora y,
  si era excepción de un perfil, vuelve a lo del perfil). Aviso al superadmin 7 días antes (notificaciones).
- **Historial de permisos** (`permisos_historial`): toda alta, cambio, baja, clave, perfil y "Ver como" con detalle legible
  (`describirCambios` en `routes/users.ts`). Configuración → Historial.
- **Ver como** (solo superadmin, solo lectura): cookie `sanatorio_ver_como`; `requireAuth` reemplaza `authUser` y rechaza todo
  lo que no sea GET (salvo salir / logout). `req.verComoDe` = el superadmin real.

Skill: `.claude/skills/usuarios/SKILL.md`

-----|--------|
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
2. `.main-column` debe tener `margin-left` igual al ancho del sidebar (inline en `App.tsx` + CSS en `index.css`).
3. Calendarios: grilla **7 columnas** (preferir **inline styles** `display:grid; gridTemplateColumns: repeat(7, ...)` para no depender solo del CSS del build).
4. No reintroducir Clerk, Replit auth, ni dependencias del snapshot viejas.
5. Textos de página no deben quedar debajo del sidebar.

Skills relacionadas: `.claude/skills/layout-ui/SKILL.md`

---

## Fiscal (Administración)

- Sin conexión a ARCA: fechas del **calendario oficial** cargadas a mano (`adm_calendario`); si faltan, **estimadas** (día habitual → día hábil) y marcadas.
- Catálogo `adm_obligaciones`; vencimientos en `adm_items` (único por obligación + mes). Se generan solos (mes actual y siguiente).
- Fecha editada a mano en un fiscal → `fecha_origen = manual`: la automatización no la pisa.
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
- [ ] Migración nueva en `packages/db/migrations/` si hubo cambio de schema
- [ ] Sin secretos en el commit

---

## No hacer sin pedido explícito

- Integración ARCA/AFIP real
- Upload binario de PDFs en producción
- QR / etiquetas impresas de inventario
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
| `docs/MIGRACIONES.md` | Migraciones automáticas (los backups los hace Sistemas con su programa) |
| `docs/MANTENIMIENTO.md` | Pantallas de sistema caído / mantenimiento (`scripts/mantenimiento.sh`) |
| `docs/NOMBRE_LOCAL.md` | Acceso por nombre (sanatorio.salvador.connect) |
| `AGENTS.md` | Resumen corto para cualquier agente |
| `.claude/skills/*/SKILL.md` | Procedimientos por dominio |
