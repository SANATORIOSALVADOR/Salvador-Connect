# AGENTS.md — Salvador-Connect

Sistema interno **Sanatorio del Salvador**. Monorepo pnpm.

## Prioridad de trabajo

1. **Administración** (vencimientos + fiscal local + calendario)
2. **Guardias Médicas** (calendario + carga activa/pasiva)
3. **Usuarios / sectores** (base)
4. Inventario / Instructivos solo si el usuario lo pide
5. Liquidación = placeholder

## Stack

- `apps/web` — React + Vite (UI base desde `artifacts/sanatorio-salvador` + overlay de pages)
- `apps/api` — Express + cookie auth
- `packages/db` — Drizzle + PostgreSQL
- Docker Compose: `db`, `api`, `web`

## Reglas

- Un módulo por cambio.
- Schema → db:push → API → UI.
- Sidebar fixed 248/72; contenido con margin-left; no chocar textos con el menú.
- Nombre UI: **Sanatorio del Salvador**.
- No secretos en git.
- Leer `CLAUDE.md` y skills en `.claude/skills/` antes de implementar.

## Build web

Editar `apps/web/src/pages/<Modulo>.tsx`. El Dockerfile aplica overlay + `scripts/patch-shell.mjs`.
