# Salvador-Connect
# Stages independientes: api no falla si web falla

FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# ---------- deps ----------
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/api-zod/package.json packages/api-zod/
COPY packages/api-spec/package.json packages/api-spec/
COPY packages/api-client-react/package.json packages/api-client-react/
COPY scripts/package.json scripts/
RUN pnpm install --no-frozen-lockfile

# ---------- API only ----------
FROM deps AS build-api
COPY . .
RUN if [ -d lib/api-client-react ]; then \
      rm -rf packages/api-client-react && cp -a lib/api-client-react packages/api-client-react && \
      find packages/api-client-react -type f \( -name '*.ts' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' || true && \
      node -e "const fs=require('fs');const p='packages/api-client-react/package.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.name='@salvador/api-client-react';fs.writeFileSync(p,JSON.stringify(d,null,2));"; \
    fi
RUN pnpm --filter @salvador/api run build

FROM node:20-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY --from=build-api /app/apps/api/dist ./dist
COPY --from=build-api /app/apps/api/package.json ./package.json
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=8 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

# ---------- WEB only (UI Replit) ----------
FROM deps AS build-web
COPY . .

# API client (imports del front)
RUN if [ -d lib/api-client-react ]; then \
      rm -rf packages/api-client-react && cp -a lib/api-client-react packages/api-client-react && \
      find packages/api-client-react -type f \( -name '*.ts' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' || true && \
      node -e "const fs=require('fs');const p='packages/api-client-react/package.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.name='@salvador/api-client-react';fs.writeFileSync(p,JSON.stringify(d,null,2));"; \
    fi

# Guardar Guardias del contexto
RUN mkdir -p /tmp/overlay && \
    if [ -f apps/web/src/pages/GuardiasMedicas.tsx ]; then cp apps/web/src/pages/GuardiasMedicas.tsx /tmp/overlay/; fi

# UI Replit ORIGINAL
RUN echo "=== UI Replit desde artifacts ===" && \
    test -f artifacts/sanatorio-salvador/src/components/ui/button.tsx && \
    test -f artifacts/sanatorio-salvador/src/App.tsx && \
    rm -rf apps/web && \
    cp -a artifacts/sanatorio-salvador apps/web && \
    rm -rf apps/web/.replit-artifact && \
    find apps/web -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' && \
    echo "=== UI Replit OK ==="

# Inyectar Guardias Médicas
RUN mkdir -p apps/web/src/pages && \
    if [ -f /tmp/overlay/GuardiasMedicas.tsx ]; then cp /tmp/overlay/GuardiasMedicas.tsx apps/web/src/pages/GuardiasMedicas.tsx; fi && \
    sed -i "s/label: 'Guardias'/label: 'Guardias Médicas'/g" apps/web/src/App.tsx && \
    (grep -q GuardiasMedicasPage apps/web/src/App.tsx || sed -i "s|import { ErrorBoundary } from '@/components/error-boundary';|import { ErrorBoundary } from '@/components/error-boundary';\nimport GuardiasMedicasPage from '@/pages/GuardiasMedicas';|" apps/web/src/App.tsx) && \
    sed -i 's|<PlaceholderPage kind="Guardias"[^>]*/>|<GuardiasMedicasPage />|g' apps/web/src/App.tsx

# main + vite + tsconfig limpio (sin references a lib/)
RUN printf '%s\n' \
  'import { createRoot } from "react-dom/client";' \
  'import App from "./App";' \
  'import "./index.css";' \
  'createRoot(document.getElementById("root")!).render(<App />);' \
  > apps/web/src/main.tsx

RUN printf '%s\n' \
  'import path from "node:path";' \
  'import { fileURLToPath } from "node:url";' \
  'import react from "@vitejs/plugin-react";' \
  'import tailwindcss from "@tailwindcss/vite";' \
  'import { defineConfig } from "vite";' \
  'const __dirname = path.dirname(fileURLToPath(import.meta.url));' \
  'export default defineConfig({' \
  '  base: "/",' \
  '  root: __dirname,' \
  '  plugins: [react(), tailwindcss()],' \
  '  resolve: { alias: { "@": path.resolve(__dirname, "src") }, dedupe: ["react", "react-dom"] },' \
  '  build: { outDir: path.resolve(__dirname, "dist"), emptyOutDir: true },' \
  '});' \
  > apps/web/vite.config.ts

RUN printf '%s\n' \
  '{' \
  '  "compilerOptions": {' \
  '    "target": "ES2022",' \
  '    "lib": ["ES2022", "DOM", "DOM.Iterable"],' \
  '    "module": "ESNext",' \
  '    "moduleResolution": "bundler",' \
  '    "jsx": "react-jsx",' \
  '    "strict": false,' \
  '    "skipLibCheck": true,' \
  '    "noEmit": true,' \
  '    "isolatedModules": true,' \
  '    "resolveJsonModule": true,' \
  '    "paths": { "@/*": ["./src/*"] }' \
  '  },' \
  '  "include": ["src"]' \
  '}' \
  > apps/web/tsconfig.json

RUN node -e "const fs=require('fs');const p='apps/web/package.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.name='@salvador/web';d.scripts={build:'vite build --config vite.config.ts',dev:'vite --config vite.config.ts --host',preview:'vite preview --config vite.config.ts --host'};const strip=o=>{if(!o)return;for(const k of Object.keys(o)){if(String(k).includes('clerk')||String(k).includes('replit'))delete o[k];if(String(k).startsWith('@workspace/')){o[k.replace('@workspace/','@salvador/')]=o[k];delete o[k];}}};strip(d.dependencies);strip(d.devDependencies);d.dependencies=d.dependencies||{};d.dependencies['@salvador/api-client-react']='workspace:*';fs.writeFileSync(p,JSON.stringify(d,null,2));" && \
    sed -i '/clerk/Id; /@clerk/d; /tw-animate-css/d' apps/web/src/index.css || true

RUN pnpm install --no-frozen-lockfile
# Mostrar error completo de Vite si falla
RUN pnpm --filter @salvador/web run build || (echo '==== VITE BUILD FAILED ===='; ls -la apps/web; cat apps/web/package.json | head -40; exit 1)
RUN ls -la apps/web/dist | head

FROM nginx:1.27-alpine AS web
COPY --from=build-web /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
