# ── Stage 1: Build Zudoku docs ──
FROM node:22-alpine AS builder

WORKDIR /build

# Copy Zudoku project files
COPY docs-zudoku/package.json docs-zudoku/.npmrc docs-zudoku/tsconfig.json docs-zudoku/zudoku.config.ts docs-zudoku/docs-custom.css ./docs-zudoku/
COPY docs-zudoku/apis/ ./docs-zudoku/apis/
COPY docs-zudoku/public/ ./docs-zudoku/public/

# Install Zudoku deps (nested strategy untuk isolasi dari workspace)
RUN cd docs-zudoku && npm install

# Build Zudoku → docs-zudoku/dist/
RUN cd docs-zudoku && npx zudoku build

# ── Stage 2: Production server ──
FROM node:22-alpine

WORKDIR /app

# Install Fastify deps
COPY package*.json ./
RUN npm install --omit=dev

# Copy server files
COPY server.mjs ./server.mjs
COPY openapi.mjs ./openapi.mjs
COPY docs-route.mjs ./docs-route.mjs

# Copy Zudoku build output
COPY --from=builder /build/docs-zudoku/dist/ ./docs-zudoku/dist/

EXPOSE 80

CMD ["node", "server.mjs"]
