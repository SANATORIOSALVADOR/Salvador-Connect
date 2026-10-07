---
name: layout-ui
description: Layout global del sistema — sidebar fixed, anchos 248/72, margin del main-column, grillas de calendario, patch-shell y CSS de build. Usar cuando textos chocan el menú, el sidebar se corta al scrollear, o calendarios se ven en una columna.
---

# Skill — Layout UI

## Reglas

1. Sidebar `position: fixed`, anchos **248** (abierto) y **72** (colapsado).
2. `.main-column` con `margin-left` = ancho del sidebar y `width/max-width: calc(100% - sideW)`.
3. Estado colapsado: clase `workspace-shell is-collapsed` + `localStorage` key `sc-sidebar-collapsed`.
4. Calendarios: `display: grid; gridTemplateColumns: repeat(7, minmax(0, 1fr))` **inline** en el JSX.
5. No editar a diario `artifacts/sanatorio-salvador`; páginas de módulo en `apps/web/src/pages/`.

## Archivos

- `scripts/patch-shell.mjs` — Shell React + append CSS OFFSET FORZADO SIDEBAR
- `Dockerfile` — bloque CSSEOF
- Páginas de módulo en `apps/web/src/pages/`

## Si el contenido queda bajo el sidebar

1. Verificar build con patch-shell (logs Shell patched / CSS offset forced).
2. Confirmar margin 72 vs 248 según colapso.
3. `docker compose build --no-cache web`

## Si el calendario se deforma

Usar **style={{}}** inline en grilla y celdas; no confiar solo en clases CSS del build.
