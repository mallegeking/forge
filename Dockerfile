# syntax=docker/dockerfile:1

# Debian slim (glibc) — reliable prebuilt native bindings for @libsql/client.
FROM node:20-bookworm-slim AS base
WORKDIR /app

# ---- Install all dependencies (incl. dev — needed to build & for db tools) ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- Build the standalone production server ----
FROM deps AS builder
COPY . .
RUN npm run build

# ---- Minimal runtime image ----
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=3000
# Bind to all interfaces so the host (and Tailscale) can reach the container.
ENV HOSTNAME=0.0.0.0
# Next.js "standalone" output: a self-contained server.js + trimmed node_modules.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
