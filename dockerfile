# ==========================================
# Tahap 1: Build React Vite App
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package.json dan install dependencies
COPY package*.json ./
RUN npm install

# Copy seluruh kode aplikasi
COPY . .

# Build aplikasi dengan Vite (menghasilkan folder 'dist')
RUN npm run build

# ==========================================
# Tahap 2: Serve dengan Nginx
# ==========================================
FROM nginx:alpine

# Copy hasil build dari Tahap 1 (folder 'dist') ke folder publik Nginx
COPY --from=builder /app/dist /usr/share/nginx/html

# Ganti konfigurasi default Nginx agar mendukung React Router (mencegah error 404)
RUN echo 'server { \
    listen 80; \
    location / { \
        root   /usr/share/nginx/html; \
        index  index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Ekspos port 80
EXPOSE 80

# Jalankan Nginx di background
CMD ["nginx", "-g", "daemon off;"]