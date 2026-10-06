# Guía operativa para Claude Code

Complementa `CLAUDE.md` (raíz). Usar este archivo cuando se pida “implementar módulo X” o “arreglar bug Y”.

## Arranque de sesión

```text
1. Leer CLAUDE.md
2. Leer docs/ESTADO_ACTUAL.md
3. Localizar archivos del módulo en la tabla de abajo
4. Implementar en el orden schema → API → UI → Dockerfile overlay si es página nueva
```

## Mapa rápido de archivos

| Módulo | API | UI | Notas |
|--------|-----|-----|--------|
| Auth / sesión | `apps/api/src/routes/auth.ts`, `lib/auth.ts` | Login en App (Replit + patch) | Cookie |
| Usuarios | `routes/users.ts` | `pages/Usuarios.tsx` | Solo superadmin escribe |
| Sectores | `routes/sectores.ts` | `pages/Configuracion.tsx` | Solo superadmin escribe |
| Guardias Médicas | `routes/guardias.ts` | `pages/GuardiasMedicas.tsx` | Calendar + carga |
| Administración | `routes/administracion.ts` | `pages/Administracion.tsx` | Fiscal + vencimientos |
| Inventario | `routes/inventario.ts` | `pages/Inventario.tsx` | Activos + movimientos |
| Instructivos | `routes/instructivos.ts` | `pages/Instructivos.tsx` | Metadatos PDF |
| Health | `routes/health.ts` | — | |
| Router | `routes/index.ts` | — | Registrar rutas nuevas aquí |

## Overlay Dockerfile

Páginas custom **deben** existir en `apps/web/src/pages/` **y** estar en el bucle:

```dockerfile
for f in GuardiasMedicas Administracion Usuarios Inventario Instructivos Configuracion; do
```

Si agregás una página nueva, sumala al `for` y al script `node -e` que reescribe `App.tsx`.

## CSS

Muchas reglas de layout viven en el bloque `CSSEOF` del `Dockerfile` (se appendean a `index.css` en build).
Si el calendario se ve en una columna o la toolbar se apila: revisar `.gm-weekdays`, `.gm-grid`, `.adm-toolbar`.

## Base de datos

```bash
export DATABASE_URL=postgresql://USER:PASS@HOST:5432/DB
pnpm run db:push
```

En Docker de prueba, preferir red interna `db:5432` y no publicar 5432 si el host ya tiene Postgres.

## Criterios de “listo”

- Listar / crear / editar / borrar funciona con el rol correcto.
- `superadmin` no queda bloqueado; `usuario` no escribe donde no debe.
- UI no rompe el sidebar (ancho fijo).
- Sin dependencias Clerk/Replit nuevas.

## Pendientes de producto (no inventar sin pedido)

- Integración ARCA/AFIP real (hoy reglas locales).
- Upload binario de PDFs.
- QR / mantenimientos de inventario.
- Liquidación.
- Hardening Proxmox (mismo Docker; backups y secrets).
