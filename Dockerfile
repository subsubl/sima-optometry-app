# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3020
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=builder /app/dist ./dist
EXPOSE 3020
CMD ["node", "server/index.mjs"]
