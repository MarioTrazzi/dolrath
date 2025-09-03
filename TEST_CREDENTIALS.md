# 🔐 Credenciais de Teste - Dolrath RPG

## 👤 **Usuário Principal (BANCO DE PRODUÇÃO)**
- **Email**: `teste@dolrath.com`
- **Senha**: `teste123`
- **Personagem**: Guerreiro Teste (Level 5, Humano Guerreiro)
- **Gold**: 1000 moedas
- **Status**: ✅ Ativo no banco Neon (produção)

## 🎮 **Como Testar:**

### 1. **Login**
1. Acesse: `https://sua-app.vercel.app/auth/login`
2. Use as credenciais: `teste@dolrath.com` / `teste123`
3. Faça login (usuário já existe no banco de produção)

### 2. **Selecionar Personagem**
1. No Dashboard, você verá: "Guerreiro Teste"
2. O personagem já está criado e pronto para combate
3. Level 5, HP: 100/100, MP: 50/50, Gold: 1000

### 3. **Testar PvP Multi-dispositivo**

#### **Dispositivo 1 (Desktop):**
1. Acesse: `https://sua-app.vercel.app/combat`
2. Selecione seu personagem
3. Crie uma sala de combate
4. Copie o link da sala

#### **Dispositivo 2 (Mobile):**
1. Acesse o mesmo link da sala
2. Ou crie outra conta de teste
3. Entre na mesma sala
4. Teste chat e combate em tempo real

## 🔧 **URLs Importantes:**

- **Frontend**: `https://sua-app.vercel.app`
- **WebSocket**: `https://dolrath-production.up.railway.app`
- **Login**: `https://sua-app.vercel.app/auth/login`
- **Combat**: `https://sua-app.vercel.app/combat`

## 📱 **Teste Completo:**

1. ✅ Login em dois dispositivos
2. ✅ Criar sala de combate
3. ✅ Chat em tempo real
4. ✅ Ações de combate
5. ✅ Conectividade WebSocket

## 🆘 **Segunda Conta (opcional):**

Se precisar de uma segunda conta para testar PvP entre diferentes usuários, execute:

```bash
npx tsx create-test-user-prisma.ts
```

E modifique o email no script para `teste2@dolrath.com`

## 🎯 **Status do Sistema:**

- ✅ Backend: Railway (WebSocket)
- ✅ Frontend: Vercel 
- ✅ Database: Neon PostgreSQL
- ✅ Auth: NextAuth configurado
- ✅ Real-time: Socket.IO funcionando
