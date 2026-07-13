# syntax=docker/dockerfile:1

FROM node:22-alpine AS build
WORKDIR /app

ARG NEXT_PUBLIC_GATEWAY_URL=http://localhost:5080
ARG NEXT_PUBLIC_RELAY_WS_URL=ws://localhost:1234/orbit
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000

ENV NEXT_PUBLIC_GATEWAY_URL=$NEXT_PUBLIC_GATEWAY_URL
ENV NEXT_PUBLIC_RELAY_WS_URL=$NEXT_PUBLIC_RELAY_WS_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/yjs-protocol/package.json packages/yjs-protocol/

RUN pnpm install --frozen-lockfile --filter @orbit/web...

COPY packages/shared-types packages/shared-types
COPY packages/yjs-protocol packages/yjs-protocol
COPY apps/web apps/web

RUN pnpm --filter @orbit/shared-types build \
  && pnpm --filter @orbit/yjs-protocol build \
  && pnpm --filter @orbit/web build

FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NODE_OPTIONS=--max-old-space-size=256
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN apk add --no-cache wget \
  && addgroup -S orbit && adduser -S orbit -G orbit

COPY --from=build /app/apps/web/public ./apps/web/public
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static

USER orbit
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3000/ || exit 1

CMD ["node", "apps/web/server.js"]
