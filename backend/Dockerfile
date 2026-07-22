FROM node:22-bookworm-slim AS build

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /opt/linx/backend

COPY backend/package.json backend/pnpm-lock.yaml backend/pnpm-workspace.yaml ./
COPY backend/tsconfig.json backend/tsconfig.base.json backend/turbo.json ./
COPY backend/apps ./apps
COPY backend/packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /opt/linx/backend
COPY --from=build --chown=node:node /opt/linx/backend /opt/linx/backend

USER node
EXPOSE 8787
CMD ["node", "apps/api/dist/main.js"]
