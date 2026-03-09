# =============================================================================
# PlayConnect API — Multi-stage Dockerfile
# Base image: Node 20 LTS (pinned major)
# Build context: repository root (monorepo)
# =============================================================================

# ---------------------------------------------------------------------------
# Stage 1: Install dependencies + build
# ---------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /repo

# Copy workspace manifests and lockfile first (cache-friendly layer)
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/prettier-config/package.json ./packages/prettier-config/

# Install ALL deps (including devDependencies for build)
# --ignore-scripts skips husky prepare which is not needed in Docker
RUN npm ci --ignore-scripts

# Copy shared packages (needed for build resolution)
COPY packages/ ./packages/

# Copy API source
COPY apps/api/ ./apps/api/

# Build contracts first (shared types required by API)
RUN npm run build --workspace=@playconnect/contracts

# Build the NestJS application
RUN npm run build --workspace=@playconnect/api

# ---------------------------------------------------------------------------
# Stage 2: Production runner (minimal, secure)
# ---------------------------------------------------------------------------
FROM node:20-alpine AS runner

# Security: do not run as root
RUN addgroup --system --gid 1001 appgroup && \
    adduser --system --uid 1001 appuser

WORKDIR /app

# Copy workspace manifests and lockfile for production install
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/contracts/package.json ./packages/contracts/
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/prettier-config/package.json ./packages/prettier-config/

# Install production dependencies only
# --ignore-scripts skips husky prepare which is not needed in Docker
RUN npm ci --omit=dev --ignore-scripts && \
    npm cache clean --force

# Copy built output from builder
COPY --from=builder /repo/packages/contracts/dist ./packages/contracts/dist
COPY --from=builder /repo/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=builder /repo/apps/api/dist ./apps/api/dist

# Set environment
ENV NODE_ENV=production
ENV TZ=Asia/Kolkata
ENV PORT=3001

# Switch to non-root user
USER appuser

EXPOSE 3001

# Healthcheck against liveness endpoint
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/v1/health/liveness || exit 1

# Start the application
CMD ["node", "apps/api/dist/main.js"]
