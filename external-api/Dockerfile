FROM node:22-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY server.mjs ./server.mjs

EXPOSE 80

CMD ["node", "server.mjs"]
