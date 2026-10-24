# syntax=docker/dockerfile:1.7
# Two deployable images from one build:
#   docker build --target api -t codecash/api .   NestJS API + Python engine CLI
#   docker build --target web -t codecash/web .   nginx serving the SPA and proxying /api
ARG NODE_IMAGE=node:24-bookworm-slim
ARG NGINX_IMAGE=nginx:1.27-alpine

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    CI=true
RUN corepack enable
WORKDIR /app

# Workspace manifests first so dependency layers stay cached until a manifest changes.
FROM base AS manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/api-client/package.json packages/api-client/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/ui/package.json packages/ui/

FROM manifests AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Production dependencies of the API only; pnpm's relative symlinks survive the copy below.
FROM manifests AS api-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter @codecash/api

FROM ${NODE_IMAGE} AS api
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 poppler-utils \
    && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3000 \
    REPO_ROOT=/app \
    DATA_DIR=/data \
    TRUST_DIR=/data/trust \
    PYTHON=python3
WORKDIR /app
COPY --from=api-deps /app/node_modules ./node_modules
COPY --from=api-deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/web/dist ./apps/web/dist
COPY apps/api/package.json ./apps/api/
# Runtime files the API reads relative to REPO_ROOT: resource definitions and the engine.
COPY packages/contracts/resources.json packages/contracts/permissions.json ./packages/contracts/
COPY apps/engine/cli.py apps/engine/dataset.py apps/engine/server.py ./apps/engine/
COPY apps/engine/validate_rules.py apps/engine/rule_language.json ./apps/engine/
COPY tools/kiem_chung_nghiep_vu.py ./tools/
COPY BangD-Case4/DataPack-CASE4_SmartContractWorkflow ./BangD-Case4/DataPack-CASE4_SmartContractWorkflow
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.API_PORT||3000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["node", "apps/api/dist/main.js"]

FROM ${NGINX_IMAGE} AS web
ENV API_UPSTREAM=http://api:3000
COPY infra/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY infra/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=5s --retries=5 \
  CMD ["wget", "-q", "-O", "/dev/null", "http://127.0.0.1/healthz"]
