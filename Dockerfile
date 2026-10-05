# Salvador-Connect — UI Replit ORIGINAL empaquetada + API
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

# API client completo
RUN if [ -f deploy/api-client.b64 ]; then \
      rm -rf packages/api-client-react && mkdir -p packages/api-client-react && \
      base64 -d deploy/api-client.b64 | tar xzf - -C packages/api-client-react && \
      find packages/api-client-react -type f \( -name '*.ts' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' || true && \
      node -e "const fs=require('fs');const p='packages/api-client-react/package.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.name='@salvador/api-client-react';fs.writeFileSync(p,JSON.stringify(d,null,2));"; \
    elif [ -d lib/api-client-react ]; then \
      rm -rf packages/api-client-react && cp -a lib/api-client-react packages/api-client-react && \
      find packages/api-client-react -type f \( -name '*.ts' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' || true; \
    fi

# UI Replit ORIGINAL (paquete deploy) — no la UI simplificada
RUN rm -rf apps/web && mkdir -p apps/web && \
    if [ -f deploy/web-ui.part00 ] && [ -f deploy/web-ui.part01 ]; then \
      cat deploy/web-ui.part00 deploy/web-ui.part01 | base64 -d | tar xzf - -C apps/web; \
    elif [ -d artifacts/sanatorio-salvador/src ]; then \
      cp -a artifacts/sanatorio-salvador/. apps/web/ && rm -rf apps/web/.replit-artifact; \
    else \
      echo "ERROR: no hay UI Replit" && exit 1; \
    fi && \
    find apps/web -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' || true && \
    test -f apps/web/src/components/ui/button.tsx && \
    test -f apps/web/src/App.tsx && \
    sed -i 's|<title>[^<]*</title>|<title>Sanatorio Salvador — Sistema Interno</title>|' apps/web/index.html || true

RUN node -e "const fs=require('fs');const p='apps/web/package.json';const d=JSON.parse(fs.readFileSync(p,'utf8'));d.name='@salvador/web';d.scripts={build:'vite build --config vite.config.ts',dev:'vite --config vite.config.ts --host',preview:'vite preview --config vite.config.ts --host',typecheck:'tsc -p tsconfig.json --noEmit'};const strip=o=>{if(!o)return;for(const k of Object.keys(o)){if(String(k).includes('clerk')||String(k).includes('replit'))delete o[k];if(String(k).startsWith('@workspace/')){o[k.replace('@workspace/','@salvador/')]=o[k];delete o[k];}}};strip(d.dependencies);strip(d.devDependencies);d.dependencies=d.dependencies||{};d.dependencies['@salvador/api-client-react']='workspace:*';fs.writeFileSync(p,JSON.stringify(d,null,2));"

RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @salvador/api run build
RUN pnpm --filter @salvador/web run build

FROM node:20-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=8 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

FROM nginx:1.27-alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
