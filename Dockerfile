# ─── Base ───
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# ─── Dependencies ───
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile

# ─── Server build ───
FROM deps AS server
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @open-deck/server build
EXPOSE 4000
CMD ["node", "apps/server/dist/index.js"]

# ─── Web build ───
FROM deps AS web-builder
COPY packages/shared packages/shared
COPY apps/web apps/web
COPY tsconfig.base.json .
RUN pnpm --filter @open-deck/web build

FROM base AS web
COPY --from=web-builder /app/apps/web/.next/standalone ./
COPY --from=web-builder /app/apps/web/.next/static .next/static
COPY --from=web-builder /app/apps/web/public public
EXPOSE 3000
CMD ["node", "server.js"]
