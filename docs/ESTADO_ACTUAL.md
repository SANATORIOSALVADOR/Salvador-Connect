# Estado actual del repositorio (octubre 2026)

## Qué ya está

- Monorepo pnpm profesional
- Backend Express con rutas de auth, users, management, health
- Auth por sesión + scrypt + bootstrap de `saceliz`
- Schema Drizzle con: users, sectors, user_sectors, user_modules, sessions, agenda_items, reminders, guardias, inventory_items, inventory_movements, instructivos
- OpenAPI + Orval + api-zod + api-client-react
- UI kit shadcn en mockup-sandbox
- CI con GitHub Actions (typecheck + build)

## Gaps respecto al Documento de Alcance MVP

1. **Inventario** todavía modelado como stock (`current_stock`, `minimum_stock`). Debe migrar a activos fijos (marca, modelo, n° serie, estado operativo/en reparación/fuera de servicio, historial de movimientos entre sectores).
2. **Guardias** sin campo `modalidad` (Presencial/Retención) ni tipo de turno “Pasiva”.
3. **Frontend de aplicación** incompleto: el mockup-sandbox es un previewer de componentes, no la app completa con Login + Layout + módulos.
4. Roles en código usan `superadmin`; alinear naming con “Administrador General / Responsable de Sector / Usuario” en UI y documentación.
5. Falta seed de sectores de ejemplo y catálogos (tipos de evento, tipos de turno).

## Orden de trabajo recomendado

1. Asegurar que `pnpm --filter @workspace/db run push` + arranque de API crean el superadmin y permiten login.
2. Consolidar frontend de aplicación (Login + Layout sidebar + Dashboard).
3. Ajustar schema de Inventario y Guardias al MVP.
4. Completar módulos en orden: Administración → Guardias → Inventario → Instructivos → Configuración.
