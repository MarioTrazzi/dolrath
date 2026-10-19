// Erros e mensagens das rotas de API (traduzidos na borda com getTFromRequest).
// ⚠️ NÃO inclui `description` de histórico: aquilo fica gravado no banco e é
// canônico em EN, como o metadata da NFT — traduzir gravaria o idioma de quem
// jogou naquele dia.
export const API_PT: Record<string, string> = {
  'Character not found': 'Personagem não encontrado',
  'Internal server error': 'Erro interno do servidor',
  'recipeId is required': 'recipeId é obrigatório',
  'Recipe not found': 'Receita não encontrada',
  'The recipe piece does not exist in the catalog': 'Peça da receita não existe no catálogo',
  'The recipe stone is unknown': 'Pedra da receita desconhecida',
  'The recipe potion does not exist in the catalog': 'Poção da receita não existe no catálogo',
  'The recipe dish does not exist in the catalog': 'Prato da receita não existe no catálogo',
  'The recipe output does not exist in the catalog': 'Saída da receita não existe no catálogo',
  'Requires Forge level {n}.': 'Requer Forja nível {n}.',
  'Requires Alchemy level {n}.': 'Requer Alquimia nível {n}.',
  'Requires Cooking level {n}.': 'Requer Culinária nível {n}.',
  'Requires Processing level {n}.': 'Requer Processamento nível {n}.',

  // Veredito das bancadas
  '⚒️ {name} forged successfully!': '⚒️ {name} forjado com sucesso!',
  '⚒️ {n}× {name} forged successfully!': '⚒️ {n}× {name} forjados com sucesso!',
  '💥 The forge failed — the materials were lost in the fire.':
    '💥 A forja falhou — os materiais se perderam no fogo.',
  '💥 The forge failed {n}× — the materials were lost in the fire.':
    '💥 A forja falhou {n}× — os materiais se perderam no fogo.',
  '⚒️ {ok} of {total} {name} survived the forge.': '⚒️ {ok} de {total} {name} sobreviveram à forja.',
  '⚗️ {n}× {name} created successfully!': '⚗️ {n}× {name} criadas com sucesso!',
  '💥 The transmutation failed — the ingredients were lost.':
    '💥 A transmutação falhou — os ingredientes se perderam.',
  '💥 The transmutation failed {n}× — the ingredients were lost.':
    '💥 A transmutação falhou {n}× — os ingredientes se perderam.',
  '⚗️ {ok} of {total} {name} survived the cauldron.': '⚗️ {ok} de {total} {name} sobreviveram ao caldeirão.',
  '🍳 {name} cooked successfully!': '🍳 {name} cozinhado com sucesso!',
  '🍳 {n}× {name} cooked successfully!': '🍳 {n}× {name} cozinhados com sucesso!',
  '⚙️ {name} processed successfully!': '⚙️ {name} processado com sucesso!',
  '⚙️ {n}× {name} processed successfully!': '⚙️ {n}× {name} processados com sucesso!',
  '⚗️ {name} created successfully!': '⚗️ {name} criada com sucesso!',

  // 🌐 A bancada consome dos DOIS inventários (src/lib/materialPool.ts); quando a
  // mochila não tem slot, a saída cai no Baú Geral e o jogador precisa saber.
  '📦 Your backpack was full — it went to the Global Chest.':
    '📦 Sua mochila estava cheia — foi para o Baú Geral.',

  // 💰 Venda ao ferreiro, consumo e transferência (rotas de inventário).
  'inventoryId is required': 'inventoryId é obrigatório',
  'itemId is required': 'itemId é obrigatório',
  'Item not found in the Global Chest': 'Item não encontrado no Baú Geral',
  'Item not found in inventory': 'Item não encontrado no inventário',
  'That item is no longer available in that quantity.': 'Esse item não está mais disponível nessa quantidade.',
  'Daily gold cap reached — the blacksmith is not buying anymore today. Come back tomorrow.':
    'Teto diário de gold atingido — o ferreiro não compra mais hoje. Volte amanhã.',
  '💰 Sold {qty}x {name} for {gold} gold!': '💰 Vendeu {qty}x {name} por {gold} gold!',
  'This piece is being listed on the market. Wait a few minutes.':
    'Esta peça está sendo listada no mercado. Aguarde alguns minutos.',
  'You do not have this item': 'Você não possui este item',
  'This item is not a consumable': 'Este item não é consumível',
  'Failed to use consumable': 'Falha ao usar consumível',

  // ⚔️ Rotas da masmorra (start/step/finish/abandon/heartbeat/progress).
  'characterId and dungeonId are required': 'characterId e dungeonId são obrigatórios',
  'Invalid dungeon': 'Masmorra inválida',
  'Tier {tier} is not unlocked yet (max: {max}). Beat the boss on tier {max} to unlock the next one.': 'Tier {tier} ainda não desbloqueado (máximo: {max}). Vença o boss no tier {max} para liberar o próximo.',
  'This hero is in a gathering session. End the gathering before entering the dungeon.': 'Este herói está numa sessão de coleta. Encerre a coleta antes de entrar na masmorra.',
  'Failed to start dungeon run': 'Falha ao iniciar a run da masmorra',
  'runId is required': 'runId é obrigatório',
  'Run not found': 'Run não encontrada',
  'Run is not active': 'Run não está ativa',
  'Run already completed': 'Run já concluída',
  'Not enough stamina': 'Stamina insuficiente',
  'Node outside the run plan': 'Nó fora da planta da run',
  'runId and reason (boss|retreat|lose) are required': 'runId e reason (boss|retreat|lose) são obrigatórios',
  'Run already closed': 'Run já encerrada',
  'Failed to finish dungeon run': 'Falha ao encerrar a run da masmorra',
  'runId or characterId is required': 'runId ou characterId é obrigatório',
  'characterId is required': 'characterId é obrigatório',
  'This hero is already in a dungeon in another tab or window. Leave the other session to free them.': 'Este herói já está em uma masmorra em outra aba ou janela. Saia da outra sessão para liberá-lo.',
  '{name} is already in a dungeon in another tab or window. Leave that session before entering with another hero.': '{name} já está em uma masmorra em outra aba ou janela. Saia daquela sessão antes de entrar com outro herói.',
  '{msg} — it comes back +2 every 15 idle min': '{msg} — ela volta +2 a cada 15 min ocioso',
  '⚗️ The Alchemist restored your health and mana for {cost} 🪙.': '⚗️ A Alquimista restaurou sua vida e mana por {cost} 🪙.',
}
