# Migración de estructura (completada en código nuevo)

## Estructura vigente

```text
apps/api
apps/web
packages/db
packages/api-spec
packages/api-zod
packages/api-client-react
scripts
docs
```

## Carpetas legadas a eliminar en el remoto

Si todavía existen, borrarlas del repo (ya no son el source of truth):

- `artifacts/` (incluye mockup-sandbox y copias viejas)
- `lib/` (código migrado a `packages/`)

### Cómo borrarlas (una vez)

```bash
git clone https://github.com/SANATORIOSALVADOR/Salvador-Connect.git
cd Salvador-Connect
git rm -rf artifacts lib
git commit -m "chore: eliminar artifacts/ y lib/ legados"
git push
```

### Frontend web

El código UI completo sigue disponible en el historial bajo `artifacts/sanatorio-salvador`.
`apps/web` tiene el bootstrap (package.json, vite, tsconfig).
Claude Code puede copiar `src/` desde el path legado o desde el historigit al armar el tramo Fundación.

### Packages generados

Copiar desde legado si falta algo en `packages/api-zod/src/generated` o `packages/api-client-react`:

```bash
# desde clone con historial
git checkout HEAD~20 -- lib/api-zod lib/api-client-react lib/api-spec
# luego mover a packages/ y ajustar imports @salvador
```
