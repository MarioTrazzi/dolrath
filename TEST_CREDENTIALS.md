# 🔐 Credenciais de Teste - Dolrath RPG

## 👤 **Usuário Principal**
- **Email**: `teste@dolrath.com`
- **Senha**: `teste123`
- **Personagem**: Guerreiro Teste (Level 5, Humano Guerreiro)
- **Gold**: 1000 moedas
- **Status**: ⚠️ Precisa ser criado no banco Neon

## 🔧 **Como Criar o Usuário no Neon:**

### **Opção 1: SQL Editor (Recomendado)**
1. Acesse o console do Neon
2. Vá para o SQL Editor
3. Copie e execute o SQL do arquivo `create-test-user.sql`:

```sql
-- 1. Criar usuário
INSERT INTO "User" (id, email, name, password, "createdAt", "updatedAt") 
VALUES (
  gen_random_uuid(),
  'teste@dolrath.com',
  'Usuário Teste',
  '$2b$12$jp8XjWtckpL7oGK0cBl6D.nnnEVV3s9m.jm92zE6eWLToexZBLbr6',
  NOW(),
  NOW()
);

-- 2. Criar personagem
INSERT INTO "Character" (
  id, "userId", name, race, class, level, hp, "maxHp", mp, "maxMp", 
  stamina, "maxStamina", gold, "availablePoints", attributes, "baseStats", 
  "createdAt", "updatedAt"
) VALUES (
  gen_random_uuid(),
  (SELECT id FROM "User" WHERE email = 'teste@dolrath.com'),
  'Guerreiro Teste', 'Humano', 'Guerreiro', 5, 100, 100, 50, 50, 
  100, 100, 1000, 0,
  '{"strength": 15, "agility": 12, "intelligence": 10, "resistance": 13, "critical": 5, "speed": 10}'::jsonb,
  '{"attack": 25, "defense": 18}'::jsonb,
  NOW(), NOW()
);
```

## 🎮 **Como Testar:**

### 1. **Criar Usuário no Banco**
1. Execute o SQL acima no console Neon
2. Verifique se foi criado com: `SELECT * FROM "User" WHERE email = 'teste@dolrath.com';`

### 2. **Login**
1. Acesse: `https://sua-app.vercel.app/auth/login`
2. Use as credenciais: `teste@dolrath.com` / `teste123`
3. Faça login

### 3. **Selecionar Personagem**
1. No Dashboard, você verá: "Guerreiro Teste"
2. O personagem já está criado e pronto para combate
3. Level 5, HP: 100/100, MP: 50/50, Gold: 1000

### 4. **Testar PvP Multi-dispositivo**

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
