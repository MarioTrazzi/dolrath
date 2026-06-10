# Build stage
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar package.json
COPY package*.json ./

# Instalar dependências
RUN npm ci

# Copiar source
COPY . .

# Build Next.js
RUN npm run build

# Production stage
FROM node:18-alpine

WORKDIR /app

# Copiar package.json
COPY package*.json ./

# Instalar dependências de produção
RUN npm ci --omit=dev

# Copiar .next do builder
COPY --from=builder /app/.next ./.next

# Copiar public e server
COPY public ./public
COPY server ./server
COPY next.config.js ./
COPY tailwind.config.js ./
COPY postcss.config.js ./

# Expor portas (3000 para Next, 3001 para WebSocket)
EXPOSE 3000 3001

# Start with both servers
CMD ["sh", "-c", "npm start & node server/socket-server.js & wait"]
