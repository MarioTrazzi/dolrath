-- Assign Cloudinary publicIds for known test items/consumables when missing.
-- Idempotent: only updates rows where image is NULL/empty.

UPDATE "Item"
SET "image" = CASE "name"
  WHEN 'Espada do Dragão Carmesim' THEN 'items/sword'
  WHEN 'Espada de Ferro' THEN 'items/sword'
  WHEN 'Cajado do Arcano' THEN 'items/staff'
  WHEN 'Cajado de Madeira' THEN 'items/staff'
  WHEN 'Armadura de Couro' THEN 'items/armor'
  WHEN 'Vestes do Sábio' THEN 'items/armor'
  WHEN 'Armadura de Placas do Guardião' THEN 'items/armor'
  WHEN 'Capuz do Ocultista' THEN 'items/helmet'
  WHEN 'Elmo do Comandante' THEN 'items/helmet'
  WHEN 'Manoplas do Titã' THEN 'items/gloves'
  WHEN 'Luvas do Conjurador' THEN 'items/gloves'
  WHEN 'Botas do Viajante' THEN 'items/boots'
  WHEN 'Botas Resistentes' THEN 'items/boots'
  WHEN 'Anel do Poder' THEN 'items/ring'
  WHEN 'Anel de Força' THEN 'items/ring'
  WHEN 'Colar do Sábio' THEN 'items/necklace'
  WHEN 'Amuleto da Vida' THEN 'items/necklace'

  -- Battle consumables
  WHEN 'Poção de Vida Pequena' THEN 'consumables/health_potion'
  WHEN 'Poção de Vida' THEN 'consumables/health_potion'
  WHEN 'Poção de Vida Grande' THEN 'consumables/health_potion'
  WHEN 'Poção de Mana' THEN 'consumables/mana_potion'
  WHEN 'Poção de Mana Grande' THEN 'consumables/mana_potion'
  WHEN 'Poção de Stamina' THEN 'consumables/stamina_potion'
  WHEN 'Elixir de Energia' THEN 'consumables/stamina_potion'
  WHEN 'Elixir Menor' THEN 'consumables/elixir'
  WHEN 'Elixir Maior' THEN 'consumables/elixir'
  WHEN 'Elixir Supremo' THEN 'consumables/elixir'
  WHEN 'Poção de Força' THEN 'consumables/strength_buff'
  WHEN 'Poção de Defesa' THEN 'consumables/defense_buff'
  WHEN 'Poção de Agilidade' THEN 'consumables/agility_buff'
  WHEN 'Poção de Reviver' THEN 'consumables/revive_potion'

  -- Other test consumables/materials
  WHEN 'Cristal Azul' THEN 'consumables/cristal_azul'
  WHEN 'Moedas Antigas' THEN 'consumables/moedas_antigas'

  ELSE "image"
END
WHERE ("image" IS NULL OR "image" = '')
  AND "name" IN (
    'Espada do Dragão Carmesim',
    'Espada de Ferro',
    'Cajado do Arcano',
    'Cajado de Madeira',
    'Armadura de Couro',
    'Vestes do Sábio',
    'Armadura de Placas do Guardião',
    'Capuz do Ocultista',
    'Elmo do Comandante',
    'Manoplas do Titã',
    'Luvas do Conjurador',
    'Botas do Viajante',
    'Botas Resistentes',
    'Anel do Poder',
    'Anel de Força',
    'Colar do Sábio',
    'Amuleto da Vida',

    'Poção de Vida Pequena',
    'Poção de Vida',
    'Poção de Vida Grande',
    'Poção de Mana',
    'Poção de Mana Grande',
    'Poção de Stamina',
    'Elixir de Energia',
    'Elixir Menor',
    'Elixir Maior',
    'Elixir Supremo',
    'Poção de Força',
    'Poção de Defesa',
    'Poção de Agilidade',
    'Poção de Reviver',

    'Cristal Azul',
    'Moedas Antigas'
  );
