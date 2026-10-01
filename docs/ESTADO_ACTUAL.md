# Estado actual — migración finalizada

> **No hay “parte 1/4” pendiente.** Ese texto solo aparece en un commit viejo del historial de Git. El estado actual del código es la estructura profesional completa.

## Estructura vigente

```text
apps/api                 @salvador/api
apps/web                 @salvador/web
packages/db              @salvador/db
packages/api-spec        @salvador/api-spec
packages/api-zod         @salvador/api-zod
packages/api-client-react
scripts/
docs/
```

## Qué hacer si todavía ves `artifacts/` o `lib/` en el árbol

Son carpetas **legadas** de Replit. Borrarlas una sola vez:

```bash
git pull
git rm -rf artifacts lib
git commit -m "chore: eliminar artifacts/ y lib/ legados"
git push
```

## Comandos

```bash
pnpm install
export DATABASE_URL=postgresql://...
pnpm run db:push
pnpm run dev:api
pnpm run dev:web
```
