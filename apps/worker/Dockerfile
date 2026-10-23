# syntax=docker/dockerfile:1.7
# PrivacyScan IL — scanner worker image.
# Build from the repository root:  docker build -f apps/worker/Dockerfile -t privacyscan-worker .

# ---- Build stage ----
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/worker/package.json apps/worker/
COPY packages/shared/package.json packages/shared/
COPY packages/tracker-db/package.json packages/tracker-db/
COPY packages/collectors/package.json packages/collectors/
COPY packages/rules/package.json packages/rules/
COPY test/package.json test/
RUN pnpm install --frozen-lockfile
COPY apps/worker apps/worker
COPY packages packages
RUN pnpm --filter @privacyscan/worker build

# ---- Runtime stage ----
# Playwright image version MUST match playwright-core in package.json (browser build compatibility).
FROM mcr.microsoft.com/playwright:v1.64.1-noble
ENV NODE_ENV=production
# Chromium's own sandbox (renderer seccomp-bpf + namespaces) is the main defense against hostile pages.
# Requires a seccomp profile that permits user namespaces (see docker-compose.yml / README).
ENV SCANNER_CHROMIUM_SANDBOX=true
WORKDIR /app
COPY --from=build /repo/apps/worker/dist ./dist
RUN printf '{"name":"privacyscan-worker","private":true,"type":"module","dependencies":{"playwright-core":"1.64.1"}}' > package.json \
 && npm install --omit=dev --no-audit --no-fund \
 && npm cache clean --force
# Non-root user provided by the Playwright image.
USER pwuser
ENTRYPOINT ["node", "dist/cli.js"]
CMD ["--help"]
