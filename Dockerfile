# Salvador-Connect — API y Web independientes

FROM node:20-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app
ENV CI=true

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

# ===== API =====
FROM deps AS build-api
COPY . .
RUN if [ -d lib/api-client-react ]; then rm -rf packages/api-client-react && cp -a lib/api-client-react packages/api-client-react && find packages/api-client-react -type f \( -name '*.ts' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' || true && node -e "const fs=require('fs');const p='packages/api-client-react/package.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.name='@salvador/api-client-react';fs.writeFileSync(p,JSON.stringify(d,null,2));"; fi
RUN pnpm --filter @salvador/api run build

FROM node:20-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY --from=build-api /app/apps/api/dist ./dist
COPY --from=build-api /app/apps/api/package.json ./package.json
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=8 CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

# ===== WEB =====
FROM deps AS build-web
COPY . .
ENV CI=true

RUN if [ -d lib/api-client-react ]; then rm -rf packages/api-client-react && cp -a lib/api-client-react packages/api-client-react && find packages/api-client-react -type f \( -name '*.ts' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' || true && node -e "const fs=require('fs');const p='packages/api-client-react/package.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.name='@salvador/api-client-react';fs.writeFileSync(p,JSON.stringify(d,null,2));"; fi

RUN mkdir -p /tmp/overlay && if [ -f apps/web/src/pages/GuardiasMedicas.tsx ]; then cp apps/web/src/pages/GuardiasMedicas.tsx /tmp/overlay/; fi

RUN echo "=== UI Replit ===" && test -f artifacts/sanatorio-salvador/src/components/ui/button.tsx && rm -rf apps/web && cp -a artifacts/sanatorio-salvador apps/web && rm -rf apps/web/.replit-artifact && find apps/web -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' && echo "=== UI OK ==="

# Guardias Médicas + branding + login directo
RUN mkdir -p apps/web/src/pages && if [ -f /tmp/overlay/GuardiasMedicas.tsx ]; then cp /tmp/overlay/GuardiasMedicas.tsx apps/web/src/pages/GuardiasMedicas.tsx; fi && \
    sed -i "s/Sanatorio Salvador/Sanatorio del Salvador/g" apps/web/src/App.tsx && \
    sed -i "s/SANATORIO SALVADOR/SANATORIO DEL SALVADOR/g" apps/web/src/App.tsx && \
    sed -i "s/label: 'Guardias'/label: 'Guardias Médicas'/g" apps/web/src/App.tsx && \
    sed -i 's|<Route path="/"><Welcome /></Route>|<Route path="/"><LoginPage /></Route>|g' apps/web/src/App.tsx && \
    (grep -q GuardiasMedicasPage apps/web/src/App.tsx || sed -i "s|import { ErrorBoundary } from '@/components/error-boundary';|import { ErrorBoundary } from '@/components/error-boundary';\nimport GuardiasMedicasPage from '@/pages/GuardiasMedicas';|" apps/web/src/App.tsx) && \
    sed -i 's|<PlaceholderPage kind="Guardias"[^>]*/>|<GuardiasMedicasPage />|g' apps/web/src/App.tsx && \
    sed -i "s/const \[mobileOpen, setMobileOpen\] = useState(false);/const [mobileOpen, setMobileOpen] = useState(false);\n  const [collapsed, setCollapsed] = useState(false);/" apps/web/src/App.tsx && \
    sed -i 's/className="workspace-shell"/className={`workspace-shell${collapsed ? " is-collapsed" : ""}`}/' apps/web/src/App.tsx && \
    sed -i 's|<Brand />\n      {nav}|<div style={{display:"flex",alignItems:"center",justifyContent:collapsed?"center":"space-between",padding:collapsed?"16px 8px 8px":"0"}}><Brand compact={collapsed} />{!collapsed \&\& <button type="button" className="btn btn-quiet btn-icon" style={{color:"hsl(var(--sidebar-foreground))",background:"transparent",border:"none"}} onClick={() => setCollapsed(true)} title="Contraer menú"><Menu size={16} /></button>}</div>{collapsed \&\& <button type="button" className="btn btn-quiet btn-icon" style={{margin:"0 auto 8px",color:"hsl(var(--sidebar-foreground))",background:"transparent",borderColor:"hsl(var(--sidebar-border))"}} onClick={() => setCollapsed(false)} title="Expandir menú"><Menu size={16} /></button>}\n      {nav}|' apps/web/src/App.tsx || true

RUN printf '%s\n' 'import { createRoot } from "react-dom/client";' 'import App from "./App";' 'import "./index.css";' 'createRoot(document.getElementById("root")!).render(<App />);' > apps/web/src/main.tsx

RUN printf '%s\n' 'import path from "node:path";' 'import { fileURLToPath } from "node:url";' 'import react from "@vitejs/plugin-react";' 'import tailwindcss from "@tailwindcss/vite";' 'import { defineConfig } from "vite";' 'const dir = path.dirname(fileURLToPath(import.meta.url));' 'export default defineConfig({ base: "/", root: dir, plugins: [react(), tailwindcss()], resolve: { alias: { "@": path.resolve(dir, "src") }, dedupe: ["react", "react-dom"] }, build: { outDir: path.resolve(dir, "dist"), emptyOutDir: true, chunkSizeWarningLimit: 2000 }, });' > apps/web/vite.config.ts

RUN printf '%s\n' '{' '  "compilerOptions": {' '    "target": "ES2022",' '    "lib": ["ES2022", "DOM", "DOM.Iterable"],' '    "module": "ESNext",' '    "moduleResolution": "bundler",' '    "jsx": "react-jsx",' '    "strict": false,' '    "skipLibCheck": true,' '    "noEmit": true,' '    "isolatedModules": true,' '    "resolveJsonModule": true,' '    "paths": { "@/*": ["./src/*"] }' '  },' '  "include": ["src"]' '}' > apps/web/tsconfig.json

RUN sed -i '/^@layer theme/d' apps/web/src/index.css && sed -i '/clerk/Id; /@clerk/d; /tw-animate-css/d' apps/web/src/index.css || true

# CSS extra: sidebar colapsable + Guardias Médicas (sin solapamientos)
RUN cat >> apps/web/src/index.css << 'CSSEOF'

.workspace-shell.is-collapsed .sidebar { width: 72px; flex-basis: 72px; }
.workspace-shell.is-collapsed .nav-label,
.workspace-shell.is-collapsed .nav-item span { display: none !important; }
.workspace-shell.is-collapsed .nav-item { justify-content: center; padding: 10px; margin: 0 6px; }
.gm-page { display: flex; flex-direction: column; gap: 18px; }
.gm-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 16px; }
.gm-tabs { display: inline-flex; padding: 4px; gap: 4px; background: hsl(var(--secondary)); border-radius: 12px; border: 1px solid hsl(var(--border)); }
.gm-tab { border: none; background: transparent; cursor: pointer; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 700; color: hsl(var(--muted-foreground)); }
.gm-tab.is-active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.gm-calendar-layout { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(260px, 0.9fr); gap: 16px; }
.gm-calendar-panel { padding: 16px; }
.gm-cal-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
.gm-cal-nav { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
.gm-cal-month { font-family: var(--app-font-display); font-weight: 800; font-size: 16px; text-transform: capitalize; min-width: 140px; text-align: center; }
.gm-filter { display: flex; align-items: center; gap: 8px; font-size: 12px; color: hsl(var(--muted-foreground)); }
.gm-filter .select { width: auto; min-width: 140px; }
.gm-weekdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; margin-bottom: 6px; }
.gm-weekday { text-align: center; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; color: hsl(var(--muted-foreground)); padding: 4px 0; }
.gm-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.gm-cell { min-height: 88px; border: 1px solid hsl(var(--border)); border-radius: 12px; background: hsl(var(--card)); padding: 8px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 4px; color: inherit; font: inherit; }
.gm-cell.is-empty { background: hsl(var(--muted) / .35); border-style: dashed; cursor: default; }
.gm-cell.is-today { border-color: hsl(var(--primary)); box-shadow: inset 0 0 0 1px hsl(var(--primary) / .35); }
.gm-cell.is-selected { border-color: hsl(var(--accent)); background: hsl(var(--accent) / .08); }
.gm-cell.has-items { background: hsl(var(--primary) / .04); }
.gm-cell:not(.is-empty):hover { border-color: hsl(var(--primary) / .5); }
.gm-day-num { font-size: 12px; font-weight: 800; }
.gm-day-chips { display: flex; flex-direction: column; gap: 3px; }
.gm-chip { display: inline-block; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%; }
.gm-chip-manana { background: hsl(174 50% 90%); color: hsl(174 55% 28%); }
.gm-chip-tarde { background: hsl(32 90% 90%); color: hsl(24 70% 35%); }
.gm-chip-noche { background: hsl(220 40% 90%); color: hsl(220 45% 35%); }
.gm-chip-24h { background: hsl(280 35% 92%); color: hsl(280 40% 35%); }
.gm-chip-more { background: hsl(var(--muted)); color: hsl(var(--muted-foreground)); }
.gm-legend { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 12px; font-size: 12px; color: hsl(var(--muted-foreground)); }
.gm-dot { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 6px; vertical-align: middle; }
.gm-day-panel { padding: 18px; align-self: start; }
.gm-detail-card { margin-top: 12px; padding: 12px; border-radius: 12px; border: 1px solid hsl(var(--border)); background: hsl(var(--background)); }
.gm-detail-top { display: flex; gap: 8px; align-items: center; margin-bottom: 6px; }
.gm-detail-name { font-weight: 800; font-size: 14px; }
.gm-detail-meta { font-size: 12px; color: hsl(var(--muted-foreground)); margin-top: 2px; }
.gm-detail-obs { font-size: 12px; margin-top: 8px; }
.gm-carga-layout { display: grid; grid-template-columns: minmax(280px, 360px) minmax(0, 1fr); gap: 16px; }
.gm-form { padding: 18px; align-self: start; }
.gm-table-wrap { padding: 18px; overflow: hidden; }
@media (max-width: 980px) { .gm-calendar-layout, .gm-carga-layout { grid-template-columns: 1fr; } .gm-cell { min-height: 72px; } }
@media (max-width: 720px) { .workspace-shell.is-collapsed .sidebar { display: none; } }
@media (max-width: 560px) { .gm-cell { min-height: 56px; padding: 4px; } .gm-day-chips { display: none; } }
CSSEOF

RUN node -e "const fs=require('fs');const p='apps/web/package.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.name='@salvador/web';d.scripts={build:'vite build --config vite.config.ts'};const dep={...(d.dependencies||{}),...(d.devDependencies||{})};for (const k of Object.keys(dep)){if(k.includes('clerk')||k.includes('replit'))delete dep[k];if(k.startsWith('@workspace/')){dep[k.replace('@workspace/','@salvador/')]=dep[k];delete dep[k];}}dep['@salvador/api-client-react']='workspace:*';dep['vite']=dep['vite']||'catalog:';dep['@vitejs/plugin-react']=dep['@vitejs/plugin-react']||'catalog:';dep['@tailwindcss/vite']=dep['@tailwindcss/vite']||'catalog:';dep['tailwindcss']=dep['tailwindcss']||'catalog:';d.dependencies=dep;d.devDependencies={};fs.writeFileSync(p,JSON.stringify(d,null,2));"

WORKDIR /app
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules && pnpm install --no-frozen-lockfile
RUN pnpm --filter @salvador/web exec vite --version
RUN pnpm --filter @salvador/web run build
RUN test -f apps/web/dist/index.html && ls -la apps/web/dist | head

FROM nginx:1.27-alpine AS web
COPY --from=build-web /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
