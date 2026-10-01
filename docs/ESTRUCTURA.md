# Estructura del monorepo

```text
apps/
  api/     Backend (@salvador/api)
  web/     Frontend (@salvador/web)
packages/
  db/
  api-spec/
  api-zod/
  api-client-react/
scripts/
docs/
```

Los paths antiguos `artifacts/` y `lib/` están deprecados. Si todavía aparecen en el árbol remoto, eliminarlos tras migrar (Claude Code / limpieza manual).

Prefijo de packages: `@salvador/*`.
