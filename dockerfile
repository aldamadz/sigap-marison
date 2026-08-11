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

# Install all workspace dependencies reproducibly.
COPY package*.json ./
COPY security/fail-closed ./security/fail-closed
COPY shared/package*.json ./shared/
COPY backend/package*.json ./backend/
COPY external-api/package*.json ./external-api/
RUN npm ci

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

ARG GIT_SHA=unknown
LABEL org.opencontainers.image.revision=$GIT_SHA
ENV GIT_SHA=$GIT_SHA

COPY package*.json ./
COPY security/fail-closed ./security/fail-closed
COPY shared/package*.json ./shared/
COPY backend/package*.json ./backend/
COPY external-api/package*.json ./external-api/
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/shared/dist ./shared/dist
COPY --from=builder /app/backend/dist ./backend/dist
COPY pdf-worker.mjs ./pdf-worker.mjs
COPY document-workbook-normalizer.mjs ./document-workbook-normalizer.mjs
COPY document-layout-rules.mjs ./document-layout-rules.mjs
COPY pgd-pdf-renderer.mjs ./pgd-pdf-renderer.mjs
COPY recommendation-pdf.mjs ./recommendation-pdf.mjs
COPY production-code.mjs ./production-code.mjs
COPY storage-path-policy.mjs ./storage-path-policy.mjs
COPY server/marison-outbound-contract.mjs ./server/marison-outbound-contract.mjs
COPY server/marison-fund-submission.mjs ./server/marison-fund-submission.mjs
COPY server/marison-asset-items.mjs ./server/marison-asset-items.mjs
COPY server/file-view-token.mjs ./server/file-view-token.mjs
COPY server/storage-coordinate.mjs ./server/storage-coordinate.mjs
COPY server/marison-outbound-identity.mjs ./server/marison-outbound-identity.mjs
COPY server/marison-branch-resolution.mjs ./server/marison-branch-resolution.mjs
COPY server/marison-payload-identity.mjs ./server/marison-payload-identity.mjs
COPY server/marison-payload-mapping-handler.mjs ./server/marison-payload-mapping-handler.mjs
COPY server/marison-payload-mapping-request.mjs ./server/marison-payload-mapping-request.mjs
COPY server/marison-employee-sync.mjs ./server/marison-employee-sync.mjs
COPY server/marison-sync-worker.mjs ./server/marison-sync-worker.mjs
COPY server/marison-outbound-worker.mjs ./server/marison-outbound-worker.mjs
COPY server/marison-rejection-diagnosis.mjs ./server/marison-rejection-diagnosis.mjs
COPY server/surat-linked-access.mjs ./server/surat-linked-access.mjs

EXPOSE 80

CMD ["node", "backend/dist/index.js"]
