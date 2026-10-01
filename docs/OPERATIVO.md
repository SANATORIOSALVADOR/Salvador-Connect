# Dejar el repo 100% operativo (antes de Claude Code)

## Qué es CI

**CI (Continuous Integration)** = GitHub Actions que en cada push corre install + typecheck + build.
Si está en rojo, algo no compila o faltan archivos.

## Por qué fallaba

1. `packages/api-zod` incompleto
2. `apps/web` sin código fuente
3. Carpetas duplicadas `artifacts/` y `lib/`
4. Lockfile de Replit desactualizado

## Arreglo en una pasada (en tu PC o Replit)

```bash
git clone https://github.com/SANATORIOSALVADOR/Salvador-Connect.git
cd Salvador-Connect
git pull
chmod +x scripts/finalize-repo.sh
./scripts/finalize-repo.sh
git push origin main
```

Luego:

```bash
cp .env.example .env
# DATABASE_URL=postgresql://user:pass@localhost:5432/sanatorio_db
pnpm run db:push
pnpm run dev:api   # puerto 5000
pnpm run dev:web   # Vite
```

Login bootstrap (solo equipo): usuario `sistemas`.
