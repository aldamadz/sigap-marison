# ── Stage 1: Build Zudoku docs ──
FROM node:22-alpine AS builder

WORKDIR /build

ARG EXTERNAL_API_PUBLIC_URL=https://external.marisoncloud.com

# Copy Zudoku project files
COPY docs-zudoku/package.json docs-zudoku/.npmrc docs-zudoku/tsconfig.json docs-zudoku/zudoku.config.ts docs-zudoku/generate-openapi.mjs ./docs-zudoku/
COPY docs-zudoku/apis/ ./docs-zudoku/apis/
COPY docs-zudoku/public/ ./docs-zudoku/public/
COPY openapi.mjs ./openapi.mjs

# Install Zudoku deps from the reviewed lockfile.
COPY docs-zudoku/package-lock.json ./docs-zudoku/package-lock.json
RUN cd docs-zudoku && npm ci

# Generate the build-time spec from the public URL, then build Zudoku.
RUN EXTERNAL_API_PUBLIC_URL="$EXTERNAL_API_PUBLIC_URL" node docs-zudoku/generate-openapi.mjs \
 && cd docs-zudoku && npx zudoku build

# Post-process prerendered HTML: Indonesian lang + drop unused CDN preconnect
RUN find docs-zudoku/dist/docs -name "*.html" -exec sed -i 's/<html lang="en"/<html lang="id"/' {} + \
 && find docs-zudoku/dist/docs -name "*.html" -exec sed -i 's#<link rel="preconnect" href="https://cdn.zudoku.dev/">##' {} +

# ── Stage 2: Production server ──
FROM node:22-alpine

WORKDIR /app

ARG GIT_SHA=unknown
LABEL org.opencontainers.image.revision=$GIT_SHA
ENV GIT_SHA=$GIT_SHA

# Install Fastify deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy server files
COPY server.mjs ./server.mjs
COPY openapi.mjs ./openapi.mjs
COPY auth.mjs ./auth.mjs
COPY docs-route.mjs ./docs-route.mjs

# Copy Zudoku build output
COPY --from=builder /build/docs-zudoku/dist/ ./docs-zudoku/dist/

EXPOSE 80

CMD ["node", "server.mjs"]
