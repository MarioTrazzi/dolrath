# Dockerfile para Railway - Apenas o servidor WebSocket
FROM node:18-alpine

# Diretório de trabalho
WORKDIR /app

# Copiar apenas os arquivos do servidor
COPY server/package*.json ./

# Instalar dependências (npm install não exige lockfile, evita falha caso o
# .railwayignore remova o package-lock.json do contexto de build)
RUN npm install --omit=dev

# Copiar código do servidor
COPY server/ ./

# Expor porta
EXPOSE 3001

# Comando de start
CMD ["npm", "start"]
