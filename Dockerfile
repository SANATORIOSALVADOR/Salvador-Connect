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

FROM deps AS build-web
COPY . .
ENV CI=true

RUN if [ -d lib/api-client-react ]; then rm -rf packages/api-client-react && cp -a lib/api-client-react packages/api-client-react && find packages/api-client-react -type f \( -name '*.ts' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' || true && node -e "const fs=require('fs');const p='packages/api-client-react/package.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.name='@salvador/api-client-react';fs.writeFileSync(p,JSON.stringify(d,null,2));"; fi

RUN mkdir -p /tmp/overlay \
 && for f in GuardiasMedicas Administracion Usuarios Inventario Instructivos Configuracion; do \
      if [ -f apps/web/src/pages/$f.tsx ]; then cp apps/web/src/pages/$f.tsx /tmp/overlay/; fi; \
    done

RUN echo "=== UI Replit ===" && test -f artifacts/sanatorio-salvador/src/components/ui/button.tsx && rm -rf apps/web && cp -a artifacts/sanatorio-salvador apps/web && rm -rf apps/web/.replit-artifact && find apps/web -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' && echo "=== UI OK ==="

RUN mkdir -p apps/web/src/pages \
 && for f in GuardiasMedicas Administracion Usuarios Inventario Instructivos Configuracion; do \
      if [ -f /tmp/overlay/$f.tsx ]; then cp /tmp/overlay/$f.tsx apps/web/src/pages/$f.tsx; fi; \
    done && \
    sed -i "s/label: 'Guardias'/label: 'Guardias Médicas'/g" apps/web/src/App.tsx && \
    sed -i 's|<Route path="/"><Welcome /></Route>|<Route path="/"><LoginPage /></Route>|g' apps/web/src/App.tsx && \
    node -e "const fs=require('fs');const p='apps/web/src/App.tsx';let t=fs.readFileSync(p,'utf8');const imports=[['GuardiasMedicasPage','@/pages/GuardiasMedicas'],['AdministracionPage','@/pages/Administracion'],['UsuariosPage','@/pages/Usuarios'],['InventarioPage','@/pages/Inventario'],['InstructivosPage','@/pages/Instructivos'],['ConfiguracionPage','@/pages/Configuracion']];for (const [name,path] of imports){if(!t.includes(name)){t=t.replace(\"import { ErrorBoundary } from '@/components/error-boundary';\",\"import { ErrorBoundary } from '@/components/error-boundary';\\nimport \"+name+\" from '\"+path+\"';\");}}t=t.replace(/<PlaceholderPage kind=\\\"Guardias\\\"[^>]*\\/>/g,'<GuardiasMedicasPage />');t=t.replace(/<AgendaPage \/>/g,'<AdministracionPage />');t=t.replace(/<UsersPage \/>/g,'<UsuariosPage />');t=t.replace(/<PlaceholderPage kind=\\\"Inventario\\\"[^>]*\\/>/g,'<InventarioPage />');t=t.replace(/<PlaceholderPage kind=\\\"Instructivos\\\"[^>]*\\/>/g,'<InstructivosPage />');t=t.replace(/<ConfigPage \/>/g,'<ConfiguracionPage />');fs.writeFileSync(p,t);console.log('App routes wired');" && \
    node scripts/patch-shell.mjs

RUN printf '%s\n' 'import { createRoot } from "react-dom/client";' 'import App from "./App";' 'import "./index.css";' 'createRoot(document.getElementById("root")!).render(<App />);' > apps/web/src/main.tsx

RUN printf '%s\n' 'import path from "node:path";' 'import { fileURLToPath } from "node:url";' 'import react from "@vitejs/plugin-react";' 'import tailwindcss from "@tailwindcss/vite";' 'import { defineConfig } from "vite";' 'const dir = path.dirname(fileURLToPath(import.meta.url));' 'export default defineConfig({ base: "/", root: dir, plugins: [react(), tailwindcss()], resolve: { alias: { "@": path.resolve(dir, "src") }, dedupe: ["react", "react-dom"] }, build: { outDir: path.resolve(dir, "dist"), emptyOutDir: true, chunkSizeWarningLimit: 2000 }, });' > apps/web/vite.config.ts

RUN printf '%s\n' '{' '  "compilerOptions": {' '    "target": "ES2022",' '    "lib": ["ES2022", "DOM", "DOM.Iterable"],' '    "module": "ESNext",' '    "moduleResolution": "bundler",' '    "jsx": "react-jsx",' '    "strict": false,' '    "skipLibCheck": true,' '    "noEmit": true,' '    "isolatedModules": true,' '    "resolveJsonModule": true,' '    "paths": { "@/*": ["./src/*"] }' '  },' '  "include": ["src"]' '}' > apps/web/tsconfig.json

RUN sed -i '/^@layer theme/d' apps/web/src/index.css && sed -i '/clerk/Id; /@clerk/d; /tw-animate-css/d' apps/web/src/index.css || true
RUN node -e "const fs=require('fs');const p='apps/web/src/index.css';let t=fs.readFileSync(p,'utf8');t=t.replace(/\.sidebar\\s*\\{[^}]*\\}/m,'.sidebar { width: 248px !important; min-width: 248px !important; max-width: 248px !important; flex: 0 0 248px !important; box-sizing: border-box !important; min-height: 100vh; display: flex; flex-direction: column; padding: 0 0 16px; background: hsl(var(--sidebar)); color: hsl(var(--sidebar-foreground)); border-right: 1px solid hsl(var(--sidebar-border)); overflow: hidden; }');t=t.replace(/\.workspace-shell\\s*\\{[^}]*\\}/m,'.workspace-shell { display: flex; min-height: 100vh; width: 100%; max-width: 100vw; overflow-x: hidden; background: hsl(var(--background)); color: hsl(var(--foreground)); }');t=t.replace(/\.main-column\\s*\\{[^}]*\\}/m,'.main-column { flex: 1 1 0%; min-width: 0; max-width: 100%; display: flex; flex-direction: column; overflow-x: hidden; background: hsl(var(--background)); }');t=t.replace(/\.main-column > :not\\(\\.topbar\\)\\s*\\{[^}]*\\}/m,'.main-column > :not(.topbar) { padding: 0; min-width: 0; max-width: 100%; overflow-x: auto; }');fs.writeFileSync(p,t);console.log('base css patched');"

RUN cat >> apps/web/src/index.css << 'CSSEOF'
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; max-width: 100vw; overflow-x: hidden; }
.workspace-shell { display: flex !important; min-height: 100vh; width: 100%; max-width: 100vw; overflow-x: hidden !important; }
.sidebar { width: 248px !important; min-width: 248px !important; max-width: 248px !important; flex: 0 0 248px !important; box-sizing: border-box !important; min-height: 100vh; height: 100vh; position: sticky; top: 0; align-self: flex-start; display: flex !important; flex-direction: column !important; padding: 14px 10px 16px !important; background: hsl(var(--sidebar)) !important; color: hsl(var(--sidebar-foreground)); border-right: 1px solid hsl(var(--sidebar-border)); overflow-x: hidden !important; overflow-y: auto !important; z-index: 20; }
.main-column { flex: 1 1 0% !important; min-width: 0 !important; max-width: 100% !important; display: flex; flex-direction: column; overflow-x: hidden !important; }
.main-column > :not(.topbar) { padding: 0 !important; min-width: 0 !important; max-width: 100% !important; }
.content-wrap, .adm-page, .gm-page, .usr-page { padding: 20px 22px 36px !important; max-width: 100%; min-width: 0; overflow-x: hidden !important; }
.sidebar-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 4px 12px; margin-bottom: 2px; border-bottom: 1px solid hsl(var(--sidebar-border) / 0.5); flex-shrink: 0; }
.sidebar-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; min-width: 0; flex: 1; overflow: hidden; }
.sidebar-brand .font-display { font-weight: 800; font-size: 12.5px !important; letter-spacing: -0.02em; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
.brand-mark { width: 32px !important; height: 32px !important; border-radius: 9px !important; display: grid; place-items: center; background: hsl(var(--sidebar-primary)); color: hsl(var(--sidebar-primary-foreground)); flex-shrink: 0; }
.sidebar-toggle { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; border: 1px solid hsl(var(--sidebar-border)); background: transparent; color: hsl(var(--sidebar-foreground) / 0.7); cursor: pointer; flex-shrink: 0; }
.nav-item { display: flex !important; align-items: center !important; gap: 10px !important; padding: 9px 10px !important; margin: 0 2px !important; border-radius: 10px !important; border: none !important; box-shadow: none !important; color: hsl(var(--sidebar-foreground) / 0.85) !important; text-decoration: none !important; font-size: 13px !important; font-weight: 500 !important; box-sizing: border-box !important; max-width: 100% !important; min-height: 36px !important; white-space: nowrap !important; overflow: hidden !important; }
.nav-item.active, .nav-item.active:hover { background: hsl(var(--sidebar-accent)) !important; color: hsl(var(--sidebar-primary)) !important; font-weight: 700 !important; padding: 9px 10px !important; }
.workspace-shell.is-collapsed .sidebar { width: 72px !important; min-width: 72px !important; max-width: 72px !important; flex: 0 0 72px !important; padding: 12px 6px 14px !important; }
.workspace-shell.is-collapsed .nav-item span { display: none !important; }
.workspace-shell.is-collapsed .nav-label { display: none !important; }
.agenda-table-wrap { overflow-x: auto !important; max-width: 100%; }
.adm-page { display: flex; flex-direction: column; gap: 16px; padding: 20px 22px 36px !important; overflow-x: hidden !important; }
.adm-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 14px; }
.adm-toolbar { display: flex !important; flex-wrap: wrap !important; gap: 10px !important; align-items: center !important; margin-bottom: 14px !important; }
.adm-toolbar .input, .adm-toolbar .select { width: auto !important; min-width: 140px !important; max-width: 280px !important; flex: 1 1 160px !important; }
.adm-toolbar .btn { flex: 0 0 auto !important; }
.adm-list-card { padding: 16px; overflow-x: auto !important; max-width: 100%; }
.adm-tabs { display: inline-flex; flex-wrap: wrap; padding: 4px; gap: 4px; background: hsl(var(--secondary)); border-radius: 12px; border: 1px solid hsl(var(--border)); }
.adm-tab { border: none; background: transparent; cursor: pointer; padding: 9px 14px; border-radius: 9px; font-size: 13px; font-weight: 700; color: hsl(var(--muted-foreground)); }
.adm-tab.is-active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.adm-alerts { padding: 14px 16px; }
.adm-alerts-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: hsl(var(--muted-foreground)); margin-bottom: 10px; }
.adm-alerts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.adm-alert-item { border-radius: 10px; padding: 10px 12px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); }
.adm-badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
.adm-urg-over { background: hsl(0 70% 94%); color: hsl(0 65% 35%); }
.adm-urg-today, .adm-urg-soon { background: hsl(25 90% 92%); color: hsl(25 70% 32%); }
.adm-urg-week { background: hsl(45 90% 92%); color: hsl(40 60% 30%); }
.adm-urg-ok { background: hsl(var(--secondary)); color: hsl(var(--muted-foreground)); }
.adm-note-preview { font-size: 11px; color: hsl(var(--muted-foreground)); margin-top: 2px; max-width: 420px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.gm-tabs { display: inline-flex; padding: 4px; gap: 4px; background: hsl(var(--secondary)); border-radius: 12px; border: 1px solid hsl(var(--border)); }
.gm-tab { border: none; background: transparent; cursor: pointer; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 700; color: hsl(var(--muted-foreground)); }
.gm-tab.is-active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.gm-calendar-layout { display: grid !important; grid-template-columns: minmax(0, 1.7fr) minmax(240px, 0.9fr) !important; gap: 16px !important; max-width: 100% !important; align-items: start !important; }
.gm-cal-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
.gm-cal-nav { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.gm-cal-month { font-weight: 800; text-transform: capitalize; min-width: 140px; text-align: center; }
.gm-weekdays { display: grid !important; grid-template-columns: repeat(7, minmax(0, 1fr)) !important; gap: 6px !important; margin-bottom: 6px !important; }
.gm-weekday { text-align: center !important; font-size: 11px !important; font-weight: 700 !important; text-transform: uppercase !important; color: hsl(var(--muted-foreground)) !important; padding: 4px 0 !important; }
.gm-grid { display: grid !important; grid-template-columns: repeat(7, minmax(0, 1fr)) !important; gap: 6px !important; max-width: 100% !important; }
.gm-cell { min-height: 92px !important; border: 1px solid hsl(var(--border)) !important; border-radius: 12px !important; background: hsl(var(--card)) !important; padding: 8px !important; text-align: left !important; cursor: pointer !important; display: flex !important; flex-direction: column !important; gap: 4px !important; color: inherit !important; font: inherit !important; width: 100% !important; box-sizing: border-box !important; overflow: hidden !important; }
.gm-cell.is-empty { background: hsl(var(--muted) / .35) !important; border-style: dashed !important; cursor: default !important; }
.gm-cell.is-today { border-color: hsl(var(--primary)) !important; }
.gm-cell.is-selected { border-color: hsl(var(--primary)); background: hsl(var(--primary) / .06); }
.gm-day-num { font-size: 12px; font-weight: 800; color: hsl(var(--muted-foreground)); }
.gm-day-chips { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.gm-chip { display: block !important; font-size: 10px !important; font-weight: 700 !important; line-height: 1.25 !important; padding: 2px 5px !important; border-radius: 6px !important; white-space: nowrap !important; overflow: hidden !important; text-overflow: ellipsis !important; max-width: 100% !important; }
.gm-chip-activa { background: hsl(160 45% 92%); color: hsl(160 50% 28%); }
.gm-chip-pasiva { background: hsl(220 40% 93%); color: hsl(220 45% 32%); }
.gm-chip-more { background: hsl(var(--secondary)); color: hsl(var(--muted-foreground)); }
.gm-legend { display: flex; gap: 16px; margin-top: 12px; font-size: 12px; color: hsl(var(--muted-foreground)); align-items: center; }
.gm-legend span { display: inline-flex; align-items: center; gap: 6px; }
.gm-dot { display: inline-block; width: 10px; height: 10px; border-radius: 999px; }
.gm-dot.gm-chip-activa { background: hsl(160 45% 45%); }
.gm-dot.gm-chip-pasiva { background: hsl(220 45% 50%); }
.gm-form, .gm-table-wrap, .gm-day-panel, .gm-calendar-panel { padding: 16px; }
.gm-detail-card { margin-top: 12px; padding: 12px; border-radius: 12px; border: 1px solid hsl(var(--border)); }

@media (max-width: 980px) { .gm-calendar-layout { grid-template-columns: 1fr !important; } }
@media (max-width: 900px) { .workspace-shell .sidebar { display: none !important; } .mobile-menu { display: inline-flex !important; } }
@media (max-width: 640px) { .adm-page, .content-wrap, .usr-page, .gm-page { padding: 14px 12px 28px !important; } }
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
