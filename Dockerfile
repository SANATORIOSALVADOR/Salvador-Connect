# Salvador-Connect — multi-stage production build
# targets: api | web

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
# Si hay UI propia con Guardias Médicas, no pisar con artifacts
RUN if [ -f apps/web/src/pages/GuardiasMedicas.tsx ]; then \
      echo "Usando apps/web (Guardias Médicas)"; \
    elif [ -d artifacts/sanatorio-salvador/src ]; then \
      rm -rf apps/web && cp -a artifacts/sanatorio-salvador apps/web && rm -rf apps/web/.replit-artifact && \
      find apps/web -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.json' \) -print0 | xargs -0 sed -i 's/@workspace\//@salvador\//g' || true; \
    fi
RUN if [ -f apps/web/src/index.css ]; then \
      sed -i "/clerk/Id; /@clerk/d; /tw-animate-css/d; s/, clerk,/,/g; s/clerk, //g" apps/web/src/index.css || true; \
    fi
RUN pnpm --filter @salvador/api run build
RUN pnpm --filter @salvador/web run build

FROM node:20-bookworm-slim AS api
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./package.json
EXPOSE 5000
HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "dist/index.mjs"]

FROM nginx:1.27-alpine AS web
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
