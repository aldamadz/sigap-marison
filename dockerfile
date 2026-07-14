# ==========================================
# Tahap 1: Build React Vite App
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package.json dan install dependencies
COPY package*.json ./
RUN npm ci

# Copy seluruh kode aplikasi
COPY . .

# Public frontend configuration is scoped to the Vite build only.
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
RUN VITE_SUPABASE_URL="$VITE_SUPABASE_URL" \
    VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY="$VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY" \
    npm run build

# ==========================================
# Tahap 2: Serve static app + PDF converter
# ==========================================
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache \
    libreoffice \
    font-noto \
    font-noto-cjk \
    ttf-dejavu

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY server.mjs ./server.mjs
COPY pdf-worker.mjs ./pdf-worker.mjs
COPY document-workbook-normalizer.mjs ./document-workbook-normalizer.mjs
COPY document-layout-rules.mjs ./document-layout-rules.mjs
COPY pgd-pdf-renderer.mjs ./pgd-pdf-renderer.mjs

EXPOSE 80

CMD ["node", "server.mjs"]
