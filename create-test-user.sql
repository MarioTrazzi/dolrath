-- SQL para criar usuário de teste no Neon
-- Copie e cole este código no SQL Editor do Neon

-- Primeiro, verificar se já existe um usuário
SELECT id, email, name FROM "User" WHERE email = 'teste@dolrath.com';

-- Se existir, deletar para recriar
DELETE FROM "Character" WHERE "userId" IN (SELECT id FROM "User" WHERE email = 'teste@dolrath.com');
DELETE FROM "User" WHERE email = 'teste@dolrath.com';

-- 1. Criar usuário (senha: teste123)
INSERT INTO "User" (id, email, name, password, "createdAt", "updatedAt") 
VALUES (
  gen_random_uuid(),
  'teste@dolrath.com',
  'Usuário Teste',
  '$2b$12$0u/.7H0/HslrcchaRozINOzuK/K3Pe3E/m098Nlg5cGOYphR9c74K',
  NOW(),
  NOW()
);

-- 2. Criar personagem para o usuário
INSERT INTO "Character" (
  id, 
  "userId", 
  name, 
  race, 
  class, 
  level, 
  hp, 
  "maxHp", 
  mp, 
  "maxMp", 
  stamina, 
  "maxStamina", 
  gold, 
  "availablePoints",
  attributes,
  "baseStats",
  "createdAt", 
  "updatedAt"
) 
VALUES (
  gen_random_uuid(),
  (SELECT id FROM "User" WHERE email = 'teste@dolrath.com'),
  'Guerreiro Teste',
  'Humano',
  'Guerreiro',
  5,
  100,
  100,
  50,
  50,
  100,
  100,
  1000,
  0,
  '{"strength": 15, "agility": 12, "intelligence": 10, "resistance": 13, "critical": 5, "speed": 10}'::jsonb,
  '{"attack": 25, "defense": 18}'::jsonb,
  NOW(),
  NOW()
);

-- 3. Verificar se foi criado corretamente
SELECT 
  u.id as user_id,
  u.email,
  u.name as user_name,
  u.password as password_hash,
  c.id as character_id,
  c.name as character_name,
  c.class,
  c.race,
  c.level,
  c.gold
FROM "User" u
LEFT JOIN "Character" c ON u.id = c."userId"
WHERE u.email = 'teste@dolrath.com';

-- 4. Teste de verificação de senha (deve retornar true)
-- Execute este comando no seu backend para testar:
-- const bcrypt = require('bcryptjs');
-- bcrypt.compare('teste123', '$2b$12$0u/.7H0/HslrcchaRozINOzuK/K3Pe3E/m098Nlg5cGOYphR9c74K')
