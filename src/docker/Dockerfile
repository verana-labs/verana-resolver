FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json ./

RUN npm install -g pnpm@8.15.0 && \
    pnpm install --frozen-lockfile && \
    pnpm store prune

COPY src/ ./src/

RUN pnpm run build

FROM node:20-alpine

RUN apk add --no-cache curl

WORKDIR /app

COPY package.json pnpm-lock.yaml ./

RUN npm install -g pnpm@8.15.0 && \
    pnpm install --frozen-lockfile --prod && \
    pnpm store prune && \
    npm cache clean --force

COPY --from=builder /app/dist ./dist

RUN addgroup -g 1001 -S nodejs && \
    adduser -S verana -u 1001 && \
    chown -R verana:nodejs /app

USER verana

EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:4000/health || exit 1

CMD ["node", "dist/main.js"]

