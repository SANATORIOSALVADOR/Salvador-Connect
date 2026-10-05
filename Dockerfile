# Salvador-Connect — UI Replit ORIGINAL (artifacts) + API
FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

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

FROM deps AS build
COPY . .

# API client completo desde lib/
RUN if [ -d lib/api-client-react ]; then \
      rm -rf packages/api-client-react && cp -a lib/api-client-react packages/api-client-react && \
      find packages/api-client-react -type f \( -name '*.ts' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' || true && \
      node -e "const fs=require('fs');const p='packages/api-client-react/package.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.name='@salvador/api-client-react';fs.writeFileSync(p,JSON.stringify(d,null,2));"; \
    fi

# FORZAR UI Replit original (borrar cualquier apps/web simplificado)
RUN echo "=== Restaurando UI Replit desde artifacts ===" && \
    test -f artifacts/sanatorio-salvador/src/components/ui/button.tsx && \
    test -f artifacts/sanatorio-salvador/src/App.tsx && \
    rm -rf apps/web && \
    cp -a artifacts/sanatorio-salvador apps/web && \
    rm -rf apps/web/.replit-artifact && \
    find apps/web -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' && \
    echo "=== UI Replit OK ==="

# Guardias Médicas
RUN mkdir -p apps/web/src/pages && \
    if [ -f /app/apps/web/src/pages/GuardiasMedicas.tsx ] || true; then true; fi
COPY apps/web/src/pages/GuardiasMedicas.tsx /tmp/GuardiasMedicas.tsx
RUN mkdir -p apps/web/src/pages && \
    cp /tmp/GuardiasMedicas.tsx apps/web/src/pages/GuardiasMedicas.tsx && \
    sed -i "s/label: 'Guardias'/label: 'Guardias Médicas'/g" apps/web/src/App.tsx && \
    (grep -q GuardiasMedicasPage apps/web/src/App.tsx || sed -i "s|import { ErrorBoundary } from '@/components/error-boundary';|import { ErrorBoundary } from '@/components/error-boundary';\nimport GuardiasMedicasPage from '@/pages/GuardiasMedicas';|" apps/web/src/App.tsx) && \
    sed -i 's|<PlaceholderPage kind="Guardias"[^>]*/>|<GuardiasMedicasPage />|g' apps/web/src/App.tsx

# main + vite producción
RUN printf '%s\n' \
  'import { createRoot } from "react-dom/client";' \
  'import App from "./App";' \
  'import "./index.css";' \
  'createRoot(document.getElementById("root")!).render(<App />);' \
  > apps/web/src/main.tsx && \
  printf '%s\n' \
  'import path from "node:path";' \
  'import react from "@vitejs/plugin-react";' \
  'import tailwindcss from "@tailwindcss/vite";' \
  'import { defineConfig } from "vite";' \
  'export default defineConfig({' \
  '  base: "/",' \
  '  plugins: [react(), tailwindcss()],' \
  '  resolve: { alias: { "@": path.resolve(__dirname, "./src") }, dedupe: ["react", "react-dom"] },' \
  '  build: { outDir: path.resolve(__dirname, "dist"), emptyOutDir: true },' \
  '});' \
  > apps/web/vite.config.ts

RUN node -e "const fs=require('fs');const p='apps/web/package.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.name='@salvador/web';d.scripts={build:'vite build --config vite.config.ts',dev:'vite --config vite.config.ts --host',preview:'vite preview --config vite.config.ts --host',typecheck:'tsc -p tsconfig.json --noEmit'};const strip=o=>{if(!o)return;for(const k of Object.keys(o)){if(String(k).includes('clerk')||String(k).includes('replit'))delete o[k];if(String(k).startsWith('@workspace/')){o[k.replace('@workspace/','@salvador/')]=o[k];delete o[k];}}};strip(d.dependencies);strip(d.devDependencies);d.dependencies=d.dependencies||{};d.dependencies['@salvador/api-client-react']='workspace:*';fs.writeFileSync(p,JSON.stringify(d,null,2));" && \
    sed -i '/clerk/Id; /@clerk/d; /tw-animate-css/d' apps/web/src/index.css || true

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @salvador/api run build
RUN pnpm --filter @salvador/web run build && \
    echo "=== Build web OK ===" && ls -la apps/web/dist | head

FROM node:20-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=8 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

FROM nginx:1.27-alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
