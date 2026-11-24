# Dockerfile para Implantação na Nuvem (Render, Railway, Fly.io, etc.)
FROM node:22-alpine AS builder

WORKDIR /app

# Instala dependências
COPY package*.json ./
RUN npm install --legacy-peer-deps

# Copia o código fonte
COPY . .

# Compila o frontend e o servidor
RUN npm run build && npm run build:server

# Estágio de produção enxuto
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV IS_CLOUD=true
ENV PORT=3000

COPY package*.json ./
RUN npm install --omit=dev --legacy-peer-deps

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-server ./dist-server
COPY --from=builder /app/server ./server
COPY --from=builder /app/public ./public

EXPOSE 3000

CMD ["node", "dist-server/server.mjs"]
