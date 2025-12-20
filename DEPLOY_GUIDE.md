# 🚀 Configuração de Deploy - Opção 1: Vercel + Railway

## 📋 Resumo da Arquitetura
- **Frontend (Next.js)**: Deploy na Vercel
- **WebSocket Server**: Deploy no Railway
- **Database**: Já configurado (Prisma)

## 🏗️ Deploy do WebSocket Server no Railway

### 1. Criar Projeto no Railway
1. Acesse [railway.app](https://railway.app)
2. Conecte seu repositório GitHub `dolrath`
3. Crie um novo projeto
4. Selecione o repositório

### 2. Configurações do Railway
- **Root Directory**: `server` (configurado automaticamente via nixpacks.toml)
- **Build Command**: `npm install` (configurado no railway.json)
- **Start Command**: `npm start` (configurado no railway.json)

### 3. Variáveis de Ambiente no Railway
```
NODE_ENV=production
PORT=3001
```

### 4. Obter URL do WebSocket
Após o deploy, o Railway fornecerá uma URL como:
`https://dolrath-websocket-production.up.railway.app`

## 🌐 Deploy do Frontend na Vercel

### 1. Conectar Repositório
1. Acesse [vercel.com](https://vercel.com)
2. Conecte o repositório GitHub `dolrath`
3. Importe o projeto

### 2. Configurações da Vercel
- **Framework**: Next.js (detectado automaticamente)
- **Build Command**: `npm run build` (configurado no vercel.json)
- **Install Command**: `npm install` (configurado no vercel.json)
- **Output Directory**: `.next` (configurado no vercel.json)
- **Root Directory**: deixe vazio

### 3. Variáveis de Ambiente na Vercel
```
NEXT_PUBLIC_SOCKET_URL=https://sua-url-do-railway.railway.app
DATABASE_URL=sua_database_url_atual
NEXTAUTH_SECRET=seu_secret_atual
NEXTAUTH_URL=https://sua-url-vercel.vercel.app
```

#### Variáveis on-chain (GOLD / NFTs / Marketplace)

Essas variáveis são necessárias para o fluxo de:
**pagar GOLD on-chain → assinar mint → mintar NFT do item → confirmar e salvar no DB**.

```bash
# Polygon RPC (fallback)
POLYGON_AMOY_RPC_URL=https://rpc-amoy.polygon.technology/

# Tesouraria que recebe GOLD (pagamentos da loja)
GOLD_TREASURY_ADDRESS=0x...

# GOLD (ERC-20)
GOLD_CONTRACT_ADDRESS=0x...
GOLD_CHAIN_ID=80002

# Assinador server-side (NUNCA expor no client)
# Recomendação: usar um signer dedicado para itens e claim.
GOLD_SIGNER_PRIVATE_KEY=0x...
# Opcional: se vazio, o backend usa GOLD_SIGNER_PRIVATE_KEY
ITEM_NFT_SIGNER_PRIVATE_KEY=0x...

# Item NFTs (ERC-721)
ITEM_NFT_CONTRACT_ADDRESS=0x...
ITEM_NFT_CHAIN_ID=80002

# Item Marketplace (escrow)
ITEM_MARKET_CONTRACT_ADDRESS=0x...
ITEM_MARKET_CHAIN_ID=80002

# DOL (se você usa criação de personagem / market de personagens)
DOL_TOKEN_ADDRESS=0x...
DOL_TREASURY_ADDRESS=0x...
```

Notas importantes:
- Para produção, **não use `localhost` em tokenURI**. Neste momento, os itens são mintados com `tokenURI` em formato `data:application/json;base64,...` (funciona em qualquer wallet sem depender de URL pública).
- Se você quiser também servir metadata via URL (para indexadores), a rota existe em `/api/nft/item/metadata/[tokenId]` e você pode configurar `ITEM_NFT_BASE_URI=https://SEU_APP.vercel.app/api/nft/item/metadata/` no deploy do contrato.

## 🔧 Configuração Passo a Passo

### Passo 1: Deploy no Railway (WebSocket)
1. ✅ Conectar repositório
2. ✅ Railway detectará automaticamente as configurações
3. ✅ Aguardar build e deploy
4. ✅ Copiar a URL gerada (ex: `https://dolrath-websocket-abc123.railway.app`)

### Passo 2: Deploy na Vercel (Frontend)
1. ✅ Conectar repositório
2. ✅ Configurar variáveis de ambiente
3. ✅ Usar a URL do Railway na variável `NEXT_PUBLIC_SOCKET_URL`
4. ✅ Deploy automático

### Passo 3: Teste Multi-dispositivo
1. ✅ Abrir aplicação na Vercel pelo desktop
2. ✅ Abrir aplicação na Vercel pelo celular
3. ✅ Criar sala de combate PvP
4. ✅ Testar chat e combate em tempo real

## 🎯 URLs Finais
- **Frontend**: `https://dolrath.vercel.app`
- **WebSocket**: `https://dolrath-websocket.railway.app`
- **Database**: Sua URL atual do banco

## 🐛 Troubleshooting

### WebSocket não conecta:
- Verificar se a URL do Railway está correta na variável `NEXT_PUBLIC_SOCKET_URL`
- Verificar se o serviço do Railway está rodando
- Verificar logs do Railway

### Erro de CORS:
- O servidor WebSocket já está configurado para aceitar conexões da Vercel

### Banco de dados:
- Usar a mesma `DATABASE_URL` que você já tem configurada

## 📱 Teste Final
Após configurar tudo:
1. Acesse pelo desktop: `https://dolrath.vercel.app/combat`
2. Acesse pelo celular: `https://dolrath.vercel.app/combat`
3. Crie uma sala e teste o combate PvP em tempo real!
