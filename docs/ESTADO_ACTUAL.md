# Estado actual del repositorio (octubre 2026)

## Qué ya está

- Monorepo pnpm profesional
- Backend Express con auth por sesión + scrypt + bootstrap superadmin
- Schema Drizzle alineado al MVP:
  - Core: users, sectors, user_sectors, user_modules, sessions
  - Agenda + reminders
  - Guardias con `shift` + `modality` (presencial/retencion)
  - Inventario como **activos fijos** + `inventory_movements` (entre sectores)
  - Instructivos (metadatos + path de PDF)
- OpenAPI + Orval + api-zod + api-client-react
- UI kit shadcn en mockup-sandbox
- CI GitHub Actions (typecheck + build)
- Docs: alcance, arquitectura, Postgres, Claude Code
- Script seed de sectores (`scripts/src/seed-sectors.ts`)

## Gaps pendientes

1. **Frontend de aplicación** incompleto: consolidar Login + Layout + Dashboard reales (el mockup-sandbox es previewer).
2. Rutas API de módulos (agenda, guardias, inventario, instructivos) parciales o a completar según OpenAPI.
3. Regenerar OpenAPI / api-zod / cliente tras cambios de schema de inventario y guardias.
4. Seed de catálogos (tipos de evento, tipos de turno) si se modelan en tablas.
5. Subida real de PDFs (storage en disco del servidor).

## Orden de trabajo recomendado

1. `DATABASE_URL` + `pnpm --filter @workspace/db run push` + arrancar API y validar login bootstrap.
2. Seed de sectores.
3. Consolidar frontend Fundación (Login + Layout + Dashboard).
4. Completar API + UI por tramo: Administración → Guardias → Inventario → Instructivos → Configuración.
5. Actualizar OpenAPI y clientes generados cuando los contratos se estabilicen.
