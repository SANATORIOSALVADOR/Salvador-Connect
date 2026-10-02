#!/usr/bin/env bash
# Restaura el frontend completo (diseño Replit) en apps/web y rebuild del contenedor web.
set -euo pipefail

INSTALL_DIR="${INSTALL_DIR:-$HOME/salvador-connect}"
cd "$INSTALL_DIR"

echo "==> git fetch + recuperar artifacts y cliente API desde origin/main"
git fetch origin
git checkout origin/main -- artifacts/sanatorio-salvador 2>/dev/null || true
git checkout origin/main -- lib/api-client-react 2>/dev/null || true

if [ ! -d artifacts/sanatorio-salvador/src ]; then
  echo "ERROR: no se pudo recuperar artifacts/sanatorio-salvador desde GitHub."
  echo "Probá: git pull && ls artifacts/"
  exit 1
fi

echo "==> Copiando a apps/web"
rm -rf apps/web
cp -a artifacts/sanatorio-salvador apps/web
rm -rf apps/web/.replit-artifact

echo "==> Cliente API en packages/"
if [ -d lib/api-client-react ]; then
  rm -rf packages/api-client-react
  cp -a lib/api-client-react packages/api-client-react
fi

echo "==> Renombrando @workspace -> @salvador"
find apps/web packages/api-client-react -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' \) -print0 \
  | xargs -0 sed -i 's/@workspace\//@salvador\//g'

# package names
python3 - <<'PY'
import json
from pathlib import Path

def set_name(path, name):
    p = Path(path)
    if not p.exists():
        return
    d = json.loads(p.read_text())
    d["name"] = name
    # strip replit/clerk
    for sec in ("dependencies", "devDependencies"):
        dep = d.get(sec, {})
        for k in list(dep):
            if "replit" in k or "clerk" in k:
                del dep[k]
            elif k.startswith("@workspace/"):
                dep[k.replace("@workspace/", "@salvador/")] = dep.pop(k)
        d[sec] = dep
    p.write_text(json.dumps(d, indent=2) + "\n")

set_name("apps/web/package.json", "@salvador/web")
set_name("packages/api-client-react/package.json", "@salvador/api-client-react")
print("ok")
PY

# vite limpio
cat > apps/web/vite.config.ts <<'VITE'
import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
  server: {
    port: Number(process.env.PORT) || 5173,
    host: true,
    proxy: {
      "/api": {
        target: process.env.API_URL || "http://localhost:5000",
        changeOrigin: true,
      },
    },
  },
});
VITE

# scripts web
python3 - <<'PY'
import json
from pathlib import Path
p = Path("apps/web/package.json")
d = json.loads(p.read_text())
d["scripts"] = {
  "dev": "vite --config vite.config.ts --host",
  "build": "vite build --config vite.config.ts",
  "preview": "vite preview --config vite.config.ts --host",
  "typecheck": "tsc -p tsconfig.json --noEmit",
}
# ensure dependency on api client
dep = d.setdefault("dependencies", {})
dep["@salvador/api-client-react"] = "workspace:*"
# move catalog react to dependencies if only in dev
p.write_text(json.dumps(d, indent=2) + "\n")
print("web package scripts ok")
PY

echo "==> Rebuild contenedores web (+ api por si cambió cliente)"
docker compose up -d --build web

echo ""
echo "Listo. Abrí la web (puerto que uses, ej. 8085):"
echo "  http://172.20.1.134:8085"
echo "Login: sistemas"
echo "Módulos: Resumen, Administración, Liquidación, Guardias, Inventario, Instructivos, Usuarios"
echo "(Guardias/Inventario/Instructivos/Liquidación son pantallas placeholder del Tramo 1; Agenda y Usuarios operativos)"
