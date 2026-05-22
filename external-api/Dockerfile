FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server.mjs ./

ENV NODE_ENV=production
ENV PORT=80

EXPOSE 80

CMD ["node", "server.mjs"]
