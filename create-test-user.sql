-- SQL para criar usuário de teste no Neon
-- Copie e cole este código no SQL Editor do Neon

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

-- 2. Criar personagem para o usuário (execute após inserir o usuário)
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
  c.id as character_id,
  c.name as character_name,
  c.class,
  c.race,
  c.level,
  c.gold
FROM "User" u
LEFT JOIN "Character" c ON u.id = c."userId"
WHERE u.email = 'teste@dolrath.com';
