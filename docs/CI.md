# Qué es CI y por qué fallaba

## Qué es CI

**CI = Continuous Integration (Integración Continua)**.

Es un proceso automático en GitHub Actions que, en cada `push` o Pull Request a `main`, hace:

1. Instalar dependencias (`pnpm install`)
2. Typecheck (TypeScript)
3. Build del API y del frontend

Sirve para detectar roturas antes de desplegar.

## Por qué estaba en rojo (failure)

1. El monorepo estaba **a medias**: `packages/api-zod` sin código generado → el API no compilaba.
2. `apps/web` sin `src/` → el build del frontend fallaba.
3. `pnpm-lock.yaml` desactualizado / grafo de dependencias de Replit.
4. Carpetas duplicadas (`artifacts/`, `lib/`) confundían la estructura real.

## Estado esperado después de la reparación

- Código completo en `apps/` y `packages/`
- CI que instala, typecheckea y buildea API + Web

Ver Actions: https://github.com/SANATORIOSALVADOR/Salvador-Connect/actions
