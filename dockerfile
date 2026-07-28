# ==========================================
# Tahap 1: Build React Vite App
# ==========================================
FROM node:22.23.1-alpine AS builder

WORKDIR /app

ARG VITE_APP_PUBLIC_URL
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY
ENV VITE_APP_PUBLIC_URL=$VITE_APP_PUBLIC_URL
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=$VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

# Install frontend, shared-contract, and backend dependencies reproducibly.
COPY package*.json ./
COPY security/fail-closed ./security/fail-closed
COPY shared/package*.json ./shared/
COPY backend/package*.json ./backend/
RUN npm ci \
    && npm --prefix shared ci \
    && npm --prefix backend ci

# Copy seluruh kode aplikasi
COPY . .

# Build shared declarations, frontend assets, and the Fastify TypeScript runtime.
RUN npm run build \
    && npm run build:backend

# ==========================================
# Tahap 2: Serve static app + PDF converter
# ==========================================
FROM node:22.23.1-alpine

WORKDIR /app

RUN apk add --no-cache \
    libreoffice \
    font-noto \
    font-noto-cjk \
    ttf-dejavu

COPY package*.json ./
COPY security/fail-closed ./security/fail-closed
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY shared/package*.json ./shared/
COPY --from=builder /app/shared/dist ./shared/dist
COPY backend/package*.json ./backend/
RUN npm --prefix backend ci --omit=dev
COPY --from=builder /app/backend/dist ./backend/dist
COPY pdf-worker.mjs ./pdf-worker.mjs
COPY document-workbook-normalizer.mjs ./document-workbook-normalizer.mjs
COPY document-layout-rules.mjs ./document-layout-rules.mjs
COPY pgd-pdf-renderer.mjs ./pgd-pdf-renderer.mjs
COPY production-code.mjs ./production-code.mjs
COPY storage-path-policy.mjs ./storage-path-policy.mjs
COPY server/marison-outbound-contract.mjs ./server/marison-outbound-contract.mjs
COPY server/marison-outbound-identity.mjs ./server/marison-outbound-identity.mjs
COPY server/marison-employee-sync.mjs ./server/marison-employee-sync.mjs
COPY server/marison-sync-worker.mjs ./server/marison-sync-worker.mjs

EXPOSE 80

CMD ["node", "backend/dist/index.js"]
