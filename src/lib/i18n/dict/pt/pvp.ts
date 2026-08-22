// Arena PvP — lobby (/combat-lobby) e sala de combate (/combat).
export const PVP_PT: Record<string, string> = {
  // Lobby: cabeçalho
  'PvP Combat Arena': 'Arena de Combate PvP',
  'Choose your arena': 'Escolha sua arena',
  'Join an existing room or create your own!': 'Entre numa sala existente ou crie a sua própria!',
  'Lv.{n}': 'Nv.{n}',
  '💀 DEAD': '💀 MORTO',
  'No character found': 'Nenhum personagem encontrado',
  'Create a character first to take part in PvP combat.':
    'Crie um personagem primeiro para poder participar de combates PvP.',

  // Matchmaking
  'Find Opponent': 'Buscar Oponente',
  'Finds someone of the same level (random queue). Rooms with friends live in Create Room / Join with ID.':
    'Encontra alguém do mesmo nível (fila aleatória). Salas com amigos ficam em Criar Sala / Entrar com ID.',
  '⚡ Stamina: ': '⚡ Stamina: ',
  ' — each fight costs ': ' — cada luta custa ',
  '{n}⚡ flat': '{n}⚡ fixos',
  ' ({n} fights per day). Enough for ': ' ({n} lutas por dia). Dá para ',
  ' now.': ' agora.',
  '⛏️ Your hero is gathering. End the gathering before entering the arena.':
    '⛏️ Seu herói está coletando. Encerre a coleta antes de entrar na arena.',
  '⚡ Each arena fight costs {required}⚡ and you have {stamina}. It comes back on its own (+2 every 15 min).':
    '⚡ Cada luta na arena custa {required}⚡ e você tem {stamina}. Ela volta sozinha (+2 a cada 15 min).',
  '5–20 s': '5–20 s',
  '10–30 s': '10–30 s',
  '20–45 s': '20–45 s',
  'up to ~1 min': 'até ~1 min',
  'Looking for a level ~{n} fighter': 'Buscando lutador nível ~{n}',
  'Waiting for {n}s': 'Esperando há {n}s',
  'Level {n}': 'Nível {n}',
  'Preparing combat…': 'Preparando combate…',

  // Criar / entrar em sala
  'Create New Room': 'Criar Nova Sala',
  'Room Name': 'Nome da Sala',
  'e.g. Arena of Champions': 'Ex: Arena dos Campeões',
  'With password (friends)': 'Com senha (amigos)',
  'Password (min. 4)': 'Senha (min. 4)',
  'A password-protected room needs at least 4 characters.':
    'Sala com senha precisa de pelo menos 4 caracteres.',
  'Create Room': 'Criar Sala',
  'Join with room ID': 'Entrar com ID da sala',
  'Room ID (e.g. room_abc123)': 'ID da sala (ex: room_abc123)',
  'Password (if any)': 'Senha (se houver)',
  'Join': 'Entrar',

  // Lista de salas
  'Available Rooms ({n})': 'Salas Disponíveis ({n})',
  'Refresh': 'Atualizar',
  'No room found': 'Nenhuma sala encontrada',
  'Be the first to create a combat arena!': 'Seja o primeiro a criar uma arena de combate!',
  'by {name}': 'por {name}',
  'Participants:': 'Participantes:',
  '⚔️ Fighters:': '⚔️ Lutadores:',
  '👁️ Spectators:': '👁️ Espectadores:',
  'Created:': 'Criada:',
  'Choose your role:': 'Escolha seu role:',
  'Fights in the combat (max. 2)': 'Participa do combate (máx. 2)',
  'Watches the combat (max. 8)': 'Assiste ao combate (máx. 8)',
  'Controls the room (max. 2) - Coming soon': 'Controla a sala (máx. 2) - Em breve',
  'Waiting': 'Aguardando',
  'In Progress': 'Em Progresso',
  'Finished': 'Finalizada',
  'Unknown': 'Desconhecido',
  'Invalid date': 'Data inválida',
  'Just now': 'Agora mesmo',
  '{n}m ago': '{n}m atrás',
  '{n}h ago': '{n}h atrás',
  '{n}d ago': '{n}d atrás',
  'Select a character': 'Selecione um personagem',
  'Character must be alive': 'Personagem deve estar vivo',
  'All roles are full': 'Todos os roles estão cheios',
  'Select Character': 'Selecione Personagem',
  'Character Dead': 'Personagem Morto',
  'Choose Role': 'Escolher Role',
  'Room Full': 'Sala Cheia',
  'In Combat': 'Em Combate',

  // Modo treino
  '🏟️ Training Mode': '🏟️ Modo Treino',
  'Close': 'Fechar',
  '🐉 Choose Monster': '🐉 Escolher Monstro',
  'Training in the same PvP arena. The opponent is a ': 'Treino na mesma arena PvP. O adversário é um ',
  'mirror of you': 'espelho seu',
  ' — same level, same attributes, same gear. The difficulty is how much it outmatches you, so the challenge is worth the same at any point of the progression. No rewards.':
    ' — mesmo nível, mesmos atributos, mesmo equipamento. A dificuldade é o quanto ele te supera, então o desafio vale o mesmo em qualquer ponto da progressão. Sem recompensas.',
  '{pct}% of your power · win rate {rate}': '{pct}% do seu poder · vitória {rate}',
  'Easy': 'Fácil',
  'Medium': 'Médio',
  'Hard': 'Difícil',
  'Very hard': 'Muito difícil',

  // Sala de combate (/combat)
  'Back to Lobby': 'Voltar ao Lobby',
  'Close room': 'Fechar sala',
  'No restoring consumable in the inventory.': 'Nenhum consumível restaurador no inventário.',
  'Not enough MP for this action!': 'MP insuficiente para esta ação!',
  '🔒 You have already transformed in this fight!': '🔒 Você já se transformou nesta luta!',

  // Sala de combate: toasts e chat de sistema
  'Character not found': 'Personagem não encontrado',
  'API not available': 'API não disponível',
  'Failed to load consumables:': 'Erro ao carregar consumíveis:',
  'Failed to consume inventory item:': 'Erro ao consumir item do inventário:',
  '❌ {name} would have no effect right now!': '❌ {name} não teria efeito agora!',
  '❌ The Special can only be used while transformed!': '❌ O Especial só pode ser usado transformado!',
  '❌ Not enough stamina! ({n} STA required)': '❌ Stamina insuficiente! ({n} STA necessária)',
  '❌ Not enough MP for this action! ({n} MP required)': '❌ MP insuficiente para esta ação! ({n} MP necessário)',
  '❌ Not enough stamina for this action! ({n} stamina required)':
    '❌ Stamina insuficiente para esta ação! ({n} stamina necessária)',
  '❌ Specials can only be used while transformed!': '❌ Os especiais só podem ser usados transformado!',
  'dodge': 'esquivar',
  'defend': 'defender',
  '❌ Not enough stamina to {action}! ({n} stamina required)':
    '❌ Stamina insuficiente para {action}! ({n} stamina necessária)',
  '❌ Not enough stamina to transform! ({n} stamina required)':
    '❌ Stamina insuficiente para transformar! ({n} stamina necessária)',
  '❌ Not enough MP to transform! ({n} MP required)': '❌ MP insuficiente para transformar! ({n} MP necessário)',
  '❌ Transformation failed: {error}': '❌ Transformação falhou: {error}',
  'error': 'erro',
  '❌ Unexpected error in the transformation': '❌ Erro inesperado na transformação',

  // Iniciativa e fim
  'Tie! Deciding by experience...': 'Empate! Decidindo por experiência...',
  '{name} won the initiative!': '{name} venceu a iniciativa!',
  'Rolling initiative...': 'Rolando iniciativa...',
  '👁️ Spectator Mode': '👁️ Modo Espectador',
  'Use the chat to follow the fight.': 'Use o chat para acompanhar a luta.',
  '🛡️ Moderating': '🛡️ Moderando',
  'Features in development.': 'Funcionalidades em desenvolvimento.',
  '🏆 VICTORY!': '🏆 VITÓRIA!',
  '💀 DEFEAT!': '💀 DERROTA!',
  '🏟️ Training complete — no XP, gold or ranking.': '🏟️ Treino concluído — sem XP, gold ou ranking.',
  'Rewards only in a ranked fight (Find Opponent / room).':
    'Recompensas só em luta ranqueada (Buscar Oponente / sala).',
  '⚠️ The rewards could not be credited. Nothing was lost.':
    '⚠️ As recompensas não puderam ser creditadas. Nada foi perdido.',
  '🤝 Fight between characters of the same account — no reward.':
    '🤝 Luta entre personagens da mesma conta — sem recompensa.',
  '⚡ No stamina to pay the arena entry — nothing was charged.':
    '⚡ Sem stamina para pagar a entrada da arena — nada foi cobrado.',
  '💰 THE ARENA PURSE': '💰 A BOLSA DA ARENA',
  '+{n} pts': '+{n} pts',
  'pts': 'pts',
  ' (total {n})': ' (total {n})',
  '🤖 House opponent — does not score in the ranking.':
    '🤖 Oponente da casa — não pontua no ranking.',
  '🔁 Daily point cap against this same opponent.':
    '🔁 Limite diário de pontos contra este mesmo oponente.',
  '⚡ One side entered without stamina for the fee — the fight does not score.':
    '⚡ Um dos lados entrou sem stamina para a taxa — a luta não pontua.',
  '⚠️ The ranking could not be updated in this fight.':
    '⚠️ O ranking não pôde ser atualizado nesta luta.',
  '🎉 You reached level {n}!': '🎉 Subiu para o nível {n}!',
  '💥 Broke: {names}': '💥 Quebrou: {names}',
  'Counting the arena purse…': 'Contando a bolsa da arena…',

  // Barra de ação
  'Waiting for opponent...': 'Aguardando oponente...',
  'Preparing for combat...': 'Preparando para o combate...',
  '✅ Ready!': '✅ Pronto!',
  '🏁 Get Ready': '🏁 Ficar Pronto',
  '🎲 Resolving blow…': '🎲 Resolvendo golpe…',
  '⚔️ Executing action...': '⚔️ Executando ação...',
  'Transformed': 'Transformado',
  'Transformation already used in this fight (1× per fight)':
    'Transformação já usada nesta luta (1× por luta)',
  'Transforming...': 'Transformando...',
  'Transf. used': 'Transf. usada',
  'Transform': 'Transformar',
  '{n} forms — MP+⚡ · 1× per fight': '{n} formas — MP+⚡ · 1× por luta',
  'creation form': 'forma da criação',
  '⚡ Initiative! Highest d20 goes first': '⚡ Iniciativa! Quem tirar mais no d20 começa',
  '🎲 Rolling d{n}…': '🎲 Rolando d{n}…',
  '😮‍💨 Opponent exhausted! Roll the d{n}!': '😮‍💨 Oponente exausto! Role o d{n}!',
  '🎲 Roll the d{n}!': '🎲 Role o d{n}!',
  'Back to the lobby': 'Voltar ao lobby',
  '🧪 Consumables': '🧪 Consumíveis',
  'Use': 'Usar',
  'Using an item consumes your turn.': 'Usar um item consome seu turno.',
  '💬 Chat': '💬 Chat',
  '{mp} MP · {sta}⚡ · {turns} turns': '{mp} MP · {sta}⚡ · {turns} turnos',
  '{n} forms': '{n} formas',
  'Loading combat...': 'Carregando combate...',
}
