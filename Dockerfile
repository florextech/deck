FROM node:20-alpine
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json apps/server/package.json
COPY packages/shared/package.json packages/shared/package.json

# Install deps
RUN pnpm install --frozen-lockfile --prod=false

# Copy source
COPY packages/shared packages/shared
COPY apps/server apps/server
COPY deck.config.json deck.config.json

EXPOSE 4000
CMD ["pnpm", "--filter", "@open-deck/server", "dev"]
