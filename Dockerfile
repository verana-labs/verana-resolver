# syntax=docker/dockerfile:1

# ============================================
# Stage 1: Install dependencies
# ============================================
FROM node:22-alpine AS deps
WORKDIR /app

# Copy package files
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# ============================================
# Stage 2: Build the application
# ============================================
FROM node:22-alpine AS builder
WORKDIR /app

# Copy dependencies from deps stage
COPY --from=deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Build TypeScript → dist/
ENV NODE_ENV=production
RUN npm run build

# ============================================
# Stage 3: Production runner (minimal image)
# ============================================
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup -S -g 1001 nodejs \
    && adduser -S -u 1001 -G nodejs resolver

# Copy package files and install production-only dependencies
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

# Copy built application
COPY --from=builder --chown=resolver:nodejs /app/dist ./dist

# Copy entrypoint script
COPY --chown=resolver:nodejs entrypoint.sh ./entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Copy default config directory (VPR allowlist)
COPY --from=builder --chown=resolver:nodejs /app/config ./config

USER resolver

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"
# Limit Node.js memory to prevent OOM kills in constrained environments
ENV NODE_OPTIONS="--max-old-space-size=512"

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["node", "dist/index.js"]
