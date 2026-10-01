# Limpieza de residuos Replit

## Eliminado

- `.replit`, `.replitignore`, `replit.md`
- `scripts/post-merge.sh` (hook de Replit)
- `@replit/connectors-sdk` del root
- `@clerk/express`, `@clerk/shared`, proxy Clerk
- `http-proxy-middleware` (solo servía al proxy Clerk)
- Overrides masivos de plataformas en `pnpm-workspace.yaml` orientados a Replit/Nix

## Excluido del workspace (sigue en el árbol por tamaño)

- `artifacts/mockup-sandbox/` — previewer de componentes de Replit Agent  
  No forma parte del build ni del typecheck del monorepo.  
  **Claude Code puede borrar la carpeta completa** cuando se cree `apps/web`.

## Auth del sistema

Solo sesiones propias + scrypt. Sin Clerk.

## Tras clonar en máquina limpia

```bash
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

El lockfile puede regenerarse; el anterior contenía el grafo de Replit.
