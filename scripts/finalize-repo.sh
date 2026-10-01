#!/usr/bin/env bash
# Ejecutar UNA vez desde la raíz del repo para dejar el árbol 100% limpio y operativo.
set -euo pipefail

echo "==> Completando packages desde lib/ (si existe)"
for pkg in api-zod api-spec api-client-react; do
  if [ -d "lib/$pkg" ] && [ ! -f "packages/$pkg/src/index.ts" ] && [ ! -d "packages/$pkg/src/generated" ]; then
    mkdir -p "packages/$pkg"
    cp -a "lib/$pkg/." "packages/$pkg/"
  fi
done

echo "==> Completando apps/web desde artifacts/sanatorio-salvador (si existe)"
if [ -d artifacts/sanatorio-salvador/src ] && [ ! -d apps/web/src ]; then
  mkdir -p apps/web
  cp -a artifacts/sanatorio-salvador/. apps/web/
  rm -rf apps/web/.replit-artifact
fi

echo "==> Renombrando @workspace -> @salvador"
find apps packages scripts -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' -o -name '*.mjs' \) -print0 \
  | xargs -0 sed -i 's/@workspace\//@salvador\//g' 2>/dev/null || true

echo "==> Eliminando legado artifacts/ y lib/"
git rm -rf artifacts lib 2>/dev/null || rm -rf artifacts lib

echo "==> Regenerando lockfile"
rm -rf node_modules pnpm-lock.yaml
pnpm install

echo "==> Commit"
git add -A
git status
git commit -m "chore: repo limpio y operativo — apps/ + packages/ sin legado" || true
echo "==> Listo. Revisá y: git push origin main"
