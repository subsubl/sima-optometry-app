FROM node:20-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY dist ./dist
COPY server ./server

ENV PORT=3020
EXPOSE 3020

CMD ["node", "server/index.mjs"]
