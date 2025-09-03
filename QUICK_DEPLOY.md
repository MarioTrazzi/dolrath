# Deploy Rápido do Sistema PvP

## 🚀 Deploy do Servidor WebSocket (Railway)

### 1. Preparar o repositório
```bash
# Commit das mudanças
git add .
git commit -m "Add WebSocket server for production"
git push origin main
```

### 2. Deploy no Railway
1. Acesse https://railway.app
2. Clique em "Start a New Project"
3. Selecione "Deploy from GitHub repo"
4. Escolha o repositório `dolrath`
5. Na configuração:
   - **Root Directory**: `/server`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Clique em "Deploy"

### 3. Configurar domínio
1. Na dashboard do Railway, clique em "Settings"
2. Em "Domains", clique em "Generate Domain"
3. Copie a URL gerada (ex: `dolrath-socket-server-production.up.railway.app`)

### 4. Atualizar URL no frontend
No arquivo `src/app/combat/page.tsx`, linha 71:
```typescript
const socketUrl = process.env.NODE_ENV === 'production' 
  ? 'wss://SEU-DOMINIO-RAILWAY.up.railway.app'  // <-- Cole aqui
  : 'ws://localhost:3001'
```

### 5. Deploy do frontend
```bash
git add .
git commit -m "Update WebSocket URL for production"
git push origin main
```

O Vercel vai fazer deploy automaticamente.

## 📱 Teste Multi-Device

1. **Desktop**: Acesse https://dolrath.vercel.app/combat-lobby
2. **Mobile**: Acesse a mesma URL no celular
3. **Criar sala**: Um dispositivo cria
4. **Entrar**: Outro dispositivo entra
5. **Combate real**: Teste PvP em tempo real!

## 🔍 Verificar Status

### WebSocket Server:
- URL: https://SEU-DOMINIO-RAILWAY.up.railway.app/health
- Deve retornar: `{"status":"ok","timestamp":"...","connections":0}`

### Frontend:
- URL: https://dolrath.vercel.app
- Console do navegador deve mostrar: "✅ Conectado ao servidor WebSocket"

## 🐛 Troubleshooting

### Se WebSocket não conectar:
1. Verificar logs no Railway: Dashboard > Deployments > Logs
2. Testar health check: `curl https://SEU-DOMINIO/health`
3. Verificar CORS no servidor

### Se chat duplicar:
- Problema já foi corrigido com cleanup dos event listeners

## 💡 URLs Importantes

- Railway Dashboard: https://railway.app/dashboard
- Vercel Dashboard: https://vercel.com/dashboard
- Repositório: https://github.com/MarioTrazzi/dolrath
