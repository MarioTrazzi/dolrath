# Dolrath RPG - Deployment Guide

## Configuração do Banco Neon PostgreSQL

### 1. Criar conta na Neon (https://neon.tech)
1. Acesse https://neon.tech
2. Clique em "Sign Up" 
3. Use GitHub ou Google para autenticação rápida

### 2. Criar novo projeto
1. Clique em "Create Project"
2. Nome: `dolrath-rpg` 
3. Região: Escolha a mais próxima (ex: AWS US East 1)
4. PostgreSQL version: 15 (padrão)

### 3. Obter Connection String
Após criar o projeto, você verá a connection string:
```
postgresql://username:password@ep-xxx.neon.tech/neondb?sslmode=require
```

### 4. Configurar Variáveis de Ambiente

#### Para desenvolvimento local:
Crie `.env.local`:
```bash
DATABASE_URL="postgresql://username:password@ep-xxx.neon.tech/neondb?sslmode=require"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="sua_chave_secreta_muito_longa_aqui"
```

#### Para produção (Vercel):
No dashboard do Vercel, adicione:
```
DATABASE_URL=postgresql://username:password@ep-xxx.neon.tech/neondb?sslmode=require
NEXTAUTH_URL=https://seu-app.vercel.app
NEXTAUTH_SECRET=sua_chave_secreta_muito_longa_aqui
```

### 5. Deploy no Vercel

1. **Conectar ao GitHub:**
   - Acesse https://vercel.com
   - Clique em "Import Project"
   - Conecte ao repositório `MarioTrazzi/dolrath`

2. **Configurar Build:**
   - Build Command: `npm run vercel-build`
   - Output Directory: `.next`
   - Install Command: `npm install`

3. **Adicionar Variáveis de Ambiente:**
   - Na aba "Environment Variables"
   - Adicione todas as variáveis acima
   - Marque para "Production", "Preview" e "Development"

4. **Deploy:**
   - Clique em "Deploy"
   - Aguarde o processo (pode levar 2-3 minutos)

### 6. Verificar Deploy

Após o deploy:
1. Acesse a URL fornecida pelo Vercel
2. Teste o registro de usuário
3. Teste a criação de personagem
4. Verifique se as dungeons funcionam

### Troubleshooting

**Erro de migração:**
```bash
npx prisma migrate reset --force
npx prisma migrate deploy
```

**Regenerar client:**
```bash
npx prisma generate
```

**Verificar conexão:**
```bash
npx prisma db pull
```

### URLs Importantes
- Neon Console: https://console.neon.tech
- Vercel Dashboard: https://vercel.com/dashboard
- Repositório: https://github.com/MarioTrazzi/dolrath

---

## Scripts Disponíveis

- `npm run dev` - Desenvolvimento local
- `npm run build` - Build local
- `npm run vercel-build` - Build para Vercel
- `npm run prisma:migrate` - Executar migrações
- `npm run prisma:generate` - Gerar client Prisma
- `npm run prisma:reset` - Reset completo do banco
- `npm run socket:dev` - Servidor WebSocket local
- `npm run dev:full` - Next.js + WebSocket juntos

---

## Deploy do Sistema PvP (WebSocket)

### 1. Deploy do Frontend (Vercel)
O frontend já está configurado para Vercel e será deployado automaticamente.

### 2. Deploy do Servidor WebSocket (Railway/Heroku)

#### Opção 1: Railway (Recomendado)
```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Deploy do servidor WebSocket
cd server
railway up
```

#### Opção 2: Heroku
```bash
# Instalar Heroku CLI
# brew install heroku/brew/heroku (macOS)

# Login
heroku login

# Criar app para WebSocket
heroku create dolrath-socket-server

# Deploy
git subtree push --prefix server heroku main
```

### 3. Configurar URLs de Produção

Atualizar em `src/app/combat/page.tsx`:
```typescript
const socketUrl = process.env.NODE_ENV === 'production' 
  ? 'wss://dolrath-socket-server.railway.app' 
  : 'ws://localhost:3001'
```

### 4. Teste Multi-Device

1. **Desktop**: Acesse https://dolrath.vercel.app/combat-lobby
2. **Mobile**: Acesse a mesma URL no celular
3. **Criar sala**: Um dispositivo cria a sala
4. **Entrar na sala**: Outro dispositivo entra na mesma sala
5. **Combate real**: Teste o sistema PvP em tempo real!

### 5. Debugging

#### Logs do WebSocket:
```bash
# Railway
railway logs

# Heroku
heroku logs --tail --app dolrath-socket-server
```

#### Verificar conectividade:
```bash
curl -I https://dolrath-socket-server.railway.app
```
