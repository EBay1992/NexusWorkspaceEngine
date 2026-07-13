# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/relay/package.json apps/relay/
COPY packages/yjs-protocol/package.json packages/yjs-protocol/
COPY packages/shared-types/package.json packages/shared-types/

RUN pnpm install --frozen-lockfile --filter @orbit/relay...

COPY packages/shared-types packages/shared-types
COPY packages/yjs-protocol packages/yjs-protocol
COPY apps/relay apps/relay

RUN pnpm --filter @orbit/shared-types build \
  && pnpm --filter @orbit/yjs-protocol build \
  && pnpm --filter @orbit/relay build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256
ENV RELAY_HOST=0.0.0.0

RUN apk add --no-cache wget

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/relay/package.json apps/relay/
COPY packages/yjs-protocol/package.json packages/yjs-protocol/
COPY packages/shared-types/package.json packages/shared-types/

COPY --from=build /app/apps/relay/dist apps/relay/dist
COPY --from=build /app/packages/yjs-protocol/dist packages/yjs-protocol/dist
COPY --from=build /app/packages/shared-types/dist packages/shared-types/dist

RUN pnpm install --frozen-lockfile --prod --filter @orbit/relay...

USER node
EXPOSE 1234

CMD ["node", "apps/relay/dist/index.js"]
