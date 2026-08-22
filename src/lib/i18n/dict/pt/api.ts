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
}
