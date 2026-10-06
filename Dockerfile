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
 && if [ -f apps/web/src/pages/GuardiasMedicas.tsx ]; then cp apps/web/src/pages/GuardiasMedicas.tsx /tmp/overlay/; fi \
 && if [ -f apps/web/src/pages/Administracion.tsx ]; then cp apps/web/src/pages/Administracion.tsx /tmp/overlay/; fi \
 && if [ -f apps/web/src/pages/Usuarios.tsx ]; then cp apps/web/src/pages/Usuarios.tsx /tmp/overlay/; fi

RUN echo "=== UI Replit ===" && test -f artifacts/sanatorio-salvador/src/components/ui/button.tsx && rm -rf apps/web && cp -a artifacts/sanatorio-salvador apps/web && rm -rf apps/web/.replit-artifact && find apps/web -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' && echo "=== UI OK ==="

RUN mkdir -p apps/web/src/pages \
 && if [ -f /tmp/overlay/GuardiasMedicas.tsx ]; then cp /tmp/overlay/GuardiasMedicas.tsx apps/web/src/pages/GuardiasMedicas.tsx; fi \
 && if [ -f /tmp/overlay/Administracion.tsx ]; then cp /tmp/overlay/Administracion.tsx apps/web/src/pages/Administracion.tsx; fi \
 && if [ -f /tmp/overlay/Usuarios.tsx ]; then cp /tmp/overlay/Usuarios.tsx apps/web/src/pages/Usuarios.tsx; fi && \
    sed -i "s/label: 'Guardias'/label: 'Guardias Médicas'/g" apps/web/src/App.tsx && \
    sed -i 's|<Route path="/"><Welcome /></Route>|<Route path="/"><LoginPage /></Route>|g' apps/web/src/App.tsx && \
    (grep -q GuardiasMedicasPage apps/web/src/App.tsx || sed -i "s|import { ErrorBoundary } from '@/components/error-boundary';|import { ErrorBoundary } from '@/components/error-boundary';\nimport GuardiasMedicasPage from '@/pages/GuardiasMedicas';|" apps/web/src/App.tsx) && \
    sed -i 's|<PlaceholderPage kind="Guardias"[^>]*/>|<GuardiasMedicasPage />|g' apps/web/src/App.tsx && \
    (grep -q AdministracionPage apps/web/src/App.tsx || sed -i "s|import GuardiasMedicasPage from '@/pages/GuardiasMedicas';|import GuardiasMedicasPage from '@/pages/GuardiasMedicas';\nimport AdministracionPage from '@/pages/Administracion';|" apps/web/src/App.tsx) && \
    sed -i 's|<AgendaPage />|<AdministracionPage />|g' apps/web/src/App.tsx && \
    (grep -q UsuariosPage apps/web/src/App.tsx || sed -i "s|import AdministracionPage from '@/pages/Administracion';|import AdministracionPage from '@/pages/Administracion';\nimport UsuariosPage from '@/pages/Usuarios';|" apps/web/src/App.tsx) && \
    sed -i 's|<UsersPage />|<UsuariosPage />|g' apps/web/src/App.tsx && \
    node scripts/patch-shell.mjs

RUN printf '%s\n' 'import { createRoot } from "react-dom/client";' 'import App from "./App";' 'import "./index.css";' 'createRoot(document.getElementById("root")!).render(<App />);' > apps/web/src/main.tsx

RUN printf '%s\n' 'import path from "node:path";' 'import { fileURLToPath } from "node:url";' 'import react from "@vitejs/plugin-react";' 'import tailwindcss from "@tailwindcss/vite";' 'import { defineConfig } from "vite";' 'const dir = path.dirname(fileURLToPath(import.meta.url));' 'export default defineConfig({ base: "/", root: dir, plugins: [react(), tailwindcss()], resolve: { alias: { "@": path.resolve(dir, "src") }, dedupe: ["react", "react-dom"] }, build: { outDir: path.resolve(dir, "dist"), emptyOutDir: true, chunkSizeWarningLimit: 2000 }, });' > apps/web/vite.config.ts

RUN printf '%s\n' '{' '  "compilerOptions": {' '    "target": "ES2022",' '    "lib": ["ES2022", "DOM", "DOM.Iterable"],' '    "module": "ESNext",' '    "moduleResolution": "bundler",' '    "jsx": "react-jsx",' '    "strict": false,' '    "skipLibCheck": true,' '    "noEmit": true,' '    "isolatedModules": true,' '    "resolveJsonModule": true,' '    "paths": { "@/*": ["./src/*"] }' '  },' '  "include": ["src"]' '}' > apps/web/tsconfig.json

RUN sed -i '/^@layer theme/d' apps/web/src/index.css && sed -i '/clerk/Id; /@clerk/d; /tw-animate-css/d' apps/web/src/index.css || true
# Forzar sidebar fija en el CSS base de Replit
RUN node -e "const fs=require('fs');const p='apps/web/src/index.css';let t=fs.readFileSync(p,'utf8');t=t.replace(/\.sidebar\\s*\\{[^}]*\\}/m,'.sidebar { width: 248px !important; min-width: 248px !important; max-width: 248px !important; flex: 0 0 248px !important; box-sizing: border-box !important; min-height: 100vh; display: flex; flex-direction: column; padding: 0 0 16px; background: hsl(var(--sidebar)); color: hsl(var(--sidebar-foreground)); border-right: 1px solid hsl(var(--sidebar-border)); overflow: hidden; }');t=t.replace(/\.workspace-shell\\s*\\{[^}]*\\}/m,'.workspace-shell { display: flex; min-height: 100vh; width: 100%; max-width: 100vw; overflow-x: hidden; background: hsl(var(--background)); color: hsl(var(--foreground)); }');t=t.replace(/\.main-column\\s*\\{[^}]*\\}/m,'.main-column { flex: 1 1 0%; min-width: 0; max-width: 100%; display: flex; flex-direction: column; overflow-x: hidden; background: hsl(var(--background)); }');t=t.replace(/\.main-column > :not\\(\\.topbar\\)\\s*\\{[^}]*\\}/m,'.main-column > :not(.topbar) { padding: 0; min-width: 0; max-width: 100%; overflow-x: auto; }');fs.writeFileSync(p,t);console.log('base css patched');"

RUN cat >> apps/web/src/index.css << 'CSSEOF'
/* === Layout system fix (sidebar fija + contenido sin solapes) === */
*, *::before, *::after { box-sizing: border-box; }
html, body, #root { height: 100%; max-width: 100vw; overflow-x: hidden; }
.workspace-shell { display: flex !important; min-height: 100vh; width: 100%; max-width: 100vw; overflow-x: hidden !important; }
.sidebar {
  width: 248px !important;
  min-width: 248px !important;
  max-width: 248px !important;
  flex: 0 0 248px !important;
  box-sizing: border-box !important;
  min-height: 100vh;
  height: 100vh;
  position: sticky;
  top: 0;
  align-self: flex-start;
  display: flex !important;
  flex-direction: column !important;
  padding: 14px 10px 16px !important;
  background: hsl(var(--sidebar)) !important;
  color: hsl(var(--sidebar-foreground));
  border-right: 1px solid hsl(var(--sidebar-border));
  overflow-x: hidden !important;
  overflow-y: auto !important;
  z-index: 20;
}
.main-column {
  flex: 1 1 0% !important;
  min-width: 0 !important;
  max-width: 100% !important;
  width: auto !important;
  display: flex;
  flex-direction: column;
  overflow-x: hidden !important;
}
.main-column > :not(.topbar) {
  padding: 0 !important;
  min-width: 0 !important;
  max-width: 100% !important;
}
.content-wrap, .adm-page, .gm-page, .usr-page {
  padding: 20px 22px 36px !important;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
}
.topbar { flex-shrink: 0; min-width: 0; }
.sidebar-top { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 4px 12px; margin-bottom: 2px; border-bottom: 1px solid hsl(var(--sidebar-border) / 0.5); flex-shrink: 0; }
.sidebar-brand { display: flex; align-items: center; gap: 10px; text-decoration: none; color: inherit; min-width: 0; flex: 1; overflow: hidden; }
.sidebar-brand .font-display { font-weight: 800; font-size: 12.5px !important; letter-spacing: -0.02em; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
.sidebar-brand .brand-sub { font-size: 9px; letter-spacing: 0.07em; text-transform: uppercase; opacity: 0.48; margin-top: 2px; font-weight: 600; }
.brand-mark { width: 32px !important; height: 32px !important; border-radius: 9px !important; display: grid; place-items: center; background: hsl(var(--sidebar-primary)); color: hsl(var(--sidebar-primary-foreground)); flex-shrink: 0; }
.sidebar-toggle { display: inline-flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 8px; border: 1px solid hsl(var(--sidebar-border)); background: transparent; color: hsl(var(--sidebar-foreground) / 0.7); cursor: pointer; flex-shrink: 0; }
.sidebar-toggle:hover { background: hsl(var(--sidebar-accent)); color: hsl(var(--sidebar-foreground)); }
.sidebar nav { display: grid; gap: 1px; padding: 8px 0 6px; flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden; }
.nav-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; opacity: 0.45; padding: 10px 10px 4px; font-weight: 700; }
.nav-item {
  display: flex !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 9px 10px !important;
  margin: 0 2px !important;
  border-radius: 10px !important;
  border: none !important;
  box-shadow: none !important;
  outline: none !important;
  color: hsl(var(--sidebar-foreground) / 0.85) !important;
  text-decoration: none !important;
  font-size: 13px !important;
  font-weight: 500 !important;
  line-height: 1.25 !important;
  box-sizing: border-box !important;
  width: auto !important;
  max-width: 100% !important;
  min-height: 36px !important;
  white-space: nowrap !important;
  overflow: hidden !important;
}
.nav-item:hover { background: hsl(var(--sidebar-accent)) !important; color: hsl(var(--sidebar-foreground)) !important; padding: 9px 10px !important; }
.nav-item.active, .nav-item.active:hover {
  background: hsl(var(--sidebar-accent)) !important;
  color: hsl(var(--sidebar-primary)) !important;
  font-weight: 700 !important;
  padding: 9px 10px !important;
  border: none !important;
  box-shadow: none !important;
  transform: none !important;
}
.nav-icon { width: 16px !important; height: 16px !important; flex-shrink: 0 !important; }
.sidebar-foot { margin-top: auto; border-top: 1px solid hsl(var(--sidebar-border) / 0.5); padding-top: 12px; flex-shrink: 0; overflow: hidden; }
.workspace-shell.is-collapsed .sidebar {
  width: 72px !important; min-width: 72px !important; max-width: 72px !important;
  flex: 0 0 72px !important; padding: 12px 6px 14px !important;
}
.workspace-shell.is-collapsed .sidebar-top { flex-direction: column; align-items: center; padding: 0 0 10px; gap: 8px; }
.workspace-shell.is-collapsed .sidebar-brand { justify-content: center; flex: 0; }
.workspace-shell.is-collapsed .sidebar-brand > div:not(.brand-mark) { display: none !important; }
.workspace-shell.is-collapsed .nav-label { display: none !important; }
.workspace-shell.is-collapsed .nav-item { justify-content: center !important; padding: 10px !important; }
.workspace-shell.is-collapsed .nav-item span { display: none !important; }
.workspace-shell.is-collapsed .sidebar-foot .avatar + div { display: none !important; }

.agenda-table-wrap, .gm-table-wrap, .adm-list-card .agenda-table-wrap {
  overflow-x: auto !important;
  max-width: 100%;
  -webkit-overflow-scrolling: touch;
}
.agenda-table, .adm-table, .users-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
}
.adm-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}
.adm-toolbar .input, .adm-toolbar .select {
  min-width: 0;
  flex: 1 1 160px;
  max-width: 100%;
}

.gm-tabs { display: inline-flex; padding: 4px; gap: 4px; background: hsl(var(--secondary)); border-radius: 12px; border: 1px solid hsl(var(--border)); }
.gm-tab { border: none; background: transparent; cursor: pointer; padding: 9px 16px; border-radius: 9px; font-size: 13px; font-weight: 700; color: hsl(var(--muted-foreground)); }
.gm-tab.is-active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.gm-calendar-layout { display: grid; grid-template-columns: minmax(0, 1.7fr) minmax(240px, 0.9fr); gap: 16px; max-width: 100%; }
.gm-grid { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; max-width: 100%; }
.gm-cell { min-height: 88px; border: 1px solid hsl(var(--border)); border-radius: 12px; background: hsl(var(--card)); padding: 8px; text-align: left; cursor: pointer; display: flex; flex-direction: column; gap: 4px; color: inherit; font: inherit; }
.gm-cell.is-empty { background: hsl(var(--muted) / .35); border-style: dashed; cursor: default; }
.gm-cell.is-today { border-color: hsl(var(--primary)); }
.gm-weekdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; margin-bottom: 6px; }
.gm-weekday { text-align: center; font-size: 11px; font-weight: 700; text-transform: uppercase; color: hsl(var(--muted-foreground)); }
.gm-cal-toolbar { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 14px; }
.gm-cal-nav { display: flex; align-items: center; gap: 8px; }
.gm-cal-month { font-weight: 800; text-transform: capitalize; min-width: 140px; text-align: center; }
.gm-form, .gm-table-wrap, .gm-day-panel, .gm-calendar-panel { padding: 16px; }
.gm-detail-card { margin-top: 12px; padding: 12px; border-radius: 12px; border: 1px solid hsl(var(--border)); }

.adm-page { display: flex; flex-direction: column; gap: 16px; padding: 20px 22px 36px !important; max-width: 100%; min-width: 0; }
.adm-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: flex-start; gap: 14px; }
.adm-tabs { display: inline-flex; flex-wrap: wrap; padding: 4px; gap: 4px; background: hsl(var(--secondary)); border-radius: 12px; border: 1px solid hsl(var(--border)); }
.adm-tab { border: none; background: transparent; cursor: pointer; padding: 9px 14px; border-radius: 9px; font-size: 13px; font-weight: 700; color: hsl(var(--muted-foreground)); }
.adm-tab.is-active { background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.adm-alerts { padding: 14px 16px; }
.adm-alerts-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: hsl(var(--muted-foreground)); margin-bottom: 10px; }
.adm-alerts-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; }
.adm-alert-item { border-radius: 10px; padding: 10px 12px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); }
.adm-badge { display: inline-block; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 999px; white-space: nowrap; }
.adm-list-card { padding: 16px; overflow: hidden; max-width: 100%; }
.adm-cal-wrap { padding: 16px; max-width: 560px; }
.adm-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
.adm-cell { min-height: 48px; border: 1px solid hsl(var(--border)); border-radius: 10px; background: hsl(var(--card)); padding: 6px; text-align: left; cursor: pointer; font: inherit; color: inherit; display: flex; flex-direction: column; }
.adm-form { padding: 18px; max-width: 520px; }

.usr-page { padding: 20px 22px 36px !important; }
.usr-modal { width: min(640px, calc(100vw - 24px)); max-height: min(92vh, 900px); overflow: auto; padding: 0 !important; }
.usr-modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; padding: 18px 20px 12px; border-bottom: 1px solid hsl(var(--border)); position: sticky; top: 0; background: hsl(var(--card)); z-index: 1; }
.usr-modal-body { padding: 16px 20px 20px; display: flex; flex-direction: column; gap: 18px; }
.usr-form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.usr-section { display: flex; flex-direction: column; gap: 10px; }
.usr-section-title { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: .04em; color: hsl(var(--muted-foreground)); }
.usr-section-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.usr-hint { font-size: 12px; color: hsl(var(--muted-foreground)); margin: 0; line-height: 1.4; }
.usr-role-row { display: flex; flex-wrap: wrap; gap: 8px; }
.usr-role-chip { border: 1px solid hsl(var(--border)); background: hsl(var(--card)); border-radius: 999px; padding: 8px 14px; font-size: 13px; font-weight: 600; cursor: pointer; color: hsl(var(--foreground)); }
.usr-role-chip.is-on { background: hsl(var(--primary) / .12); border-color: hsl(var(--primary) / .35); color: hsl(var(--primary)); }
.usr-preset-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.usr-preset { text-align: left; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); border-radius: 12px; padding: 10px 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; }
.usr-preset.is-on { border-color: hsl(var(--primary) / .4); background: hsl(var(--primary) / .08); box-shadow: inset 0 0 0 1px hsl(var(--primary) / .2); }
.usr-preset-label { font-size: 13px; font-weight: 700; }
.usr-preset-hint { font-size: 11px; color: hsl(var(--muted-foreground)); }
.usr-module-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.usr-module-card { display: flex; align-items: flex-start; gap: 10px; text-align: left; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); border-radius: 12px; padding: 10px 12px; cursor: pointer; color: inherit; font: inherit; position: relative; }
.usr-module-card.is-on { border-color: hsl(var(--primary) / .4); background: hsl(var(--primary) / .07); }
.usr-module-check { position: absolute; top: 8px; right: 8px; width: 18px; height: 18px; border-radius: 999px; display: grid; place-items: center; background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); }
.usr-module-card:not(.is-on) .usr-module-check { display: none; }
.usr-module-icon { width: 32px; height: 32px; border-radius: 9px; display: grid; place-items: center; background: hsl(var(--secondary)); color: hsl(var(--foreground)); flex-shrink: 0; }
.usr-module-card.is-on .usr-module-icon { background: hsl(var(--primary) / .15); color: hsl(var(--primary)); }
.usr-module-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; padding-right: 16px; }
.usr-module-name { font-size: 13px; font-weight: 700; }
.usr-module-desc { font-size: 11px; color: hsl(var(--muted-foreground)); line-height: 1.3; }
.usr-sector-grid { display: flex; flex-wrap: wrap; gap: 8px; }
.usr-sector-chip { display: inline-flex; align-items: center; gap: 6px; border: 1px solid hsl(var(--border)); background: hsl(var(--card)); border-radius: 999px; padding: 7px 12px; font-size: 12.5px; font-weight: 600; cursor: pointer; color: hsl(var(--foreground)); }
.usr-sector-chip.is-on { background: hsl(var(--primary) / .12); border-color: hsl(var(--primary) / .35); color: hsl(var(--primary)); }
.usr-modal-actions { display: flex; justify-content: flex-end; gap: 9px; padding-top: 8px; border-top: 1px solid hsl(var(--border)); margin-top: 4px; }
@media (max-width: 980px) { .gm-calendar-layout { grid-template-columns: 1fr; } }
@media (max-width: 900px) { .workspace-shell .sidebar { display: none !important; } .mobile-menu { display: inline-flex !important; } }
@media (max-width: 640px) { .usr-form-grid, .usr-preset-grid, .usr-module-grid { grid-template-columns: 1fr; } .adm-page, .content-wrap, .usr-page { padding: 14px 12px 28px !important; } }
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
