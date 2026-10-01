# Migración de estructura — COMPLETA

No hay partes 1/2/3/4 pendientes.

## Estructura definitiva

| Path | Package |
|------|--------|
| `apps/api` | `@salvador/api` |
| `apps/web` | `@salvador/web` |
| `packages/db` | `@salvador/db` |
| `packages/api-spec` | `@salvador/api-spec` |
| `packages/api-zod` | `@salvador/api-zod` |
| `packages/api-client-react` | `@salvador/api-client-react` |

## Historial de Git

Si en el historial aparece un commit con el texto “parte 1/4”, es solo un mensaje antiguo. **No indica trabajo incompleto.** El commit posterior `migracion ... FINALIZADA` cierra la refactorización.

## Limpieza opcional del árbol

```bash
git rm -rf artifacts lib
git commit -m "chore: eliminar carpetas legadas artifacts/ y lib/"
git push
```
