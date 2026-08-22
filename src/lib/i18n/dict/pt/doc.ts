// 📖 /doc — Documentação pública (Game Bible). Prosa longa + rótulos das tabelas.
export const DOC_PT: Record<string, string> = {
  // Selos de status
  '🔜 TODO': '🔜 A FAZER',
  '✅ LIVE': '✅ AO VIVO',
  '🔜 COMING SOON': '🔜 EM BREVE',
  '🛠️ PHASE 2': '🛠️ FASE 2',

  // Raridade
  'Common': 'Comum',
  'Uncommon': 'Incomum',
  'Rare': 'Raro',
  'Epic': 'Épico',
  'Legendary': 'Lendário',

  // Armas / builds / fontes
  'Sword': 'Espada',
  'Dagger': 'Adaga',
  'Staff': 'Cajado',
  'Bow': 'Arco',
  'Mace': 'Maça',
  'Spear': 'Lança',
  'Fists': 'Punhos',
  'damage': 'dano',
  'defense': 'defesa',
  'speed': 'vel',
  '🏪 Shop': '🏪 Loja',
  '🗝️ Dungeon': '🗝️ Masmorra',
  '👑 Boss': '👑 Chefe',
  '🗓️ Adventure': '🗓️ Aventura',
  '💪 Strength': '💪 Força',
  '🏹 Agility': '🏹 Agilidade',
  '🔮 Arcane': '🔮 Arcano',
  '🛡️ Guardian': '🛡️ Guardião',

  // Pedras de aprimoramento
  '+1 to +15 · weapons/shields': '+1 a +15 · armas/escudos',
  '+1 to +15 · armour': '+1 a +15 · armaduras',
  'I–V (PRI–PEN) · weapons/shields': 'I–V (PRI–PEN) · armas/escudos',
  'I–V (PRI–PEN) · armour': 'I–V (PRI–PEN) · armaduras',

  // Chefes de aventura
  'Week 1': 'Semana 1',
  'Week 2': 'Semana 2',
  'Week 3': 'Semana 3',
  'Week 4': 'Semana 4',
  'the World Devourer': 'o Devorador de Mundos',
  'the Weaver of the Void': 'a Tecelã do Vazio',
  'the Colossus of Adamantite': 'o Colosso de Adamantite',
  'the Celestial Queen': 'a Rainha Celeste',
  'Fiery dragon': 'Dragão ígneo',
  'Void spider': 'Aranha do vazio',
  'Titanic golem': 'Golem titânico',
  'Fallen elf': 'Elfa caída',
  'Saturday': 'Sábado',
  'full HP': 'HP total',
  'full MP': 'MP total',
  'dodge': 'esquiva',
  'shield {n}': 'escudo {n}',
  'revive {n}%': 'revive {n}%',
  '{n} turns': '{n} turnos',
  'cures status': 'cura status',
  'Draconian': 'Draconiano',
  'Shapeshifter': 'Metamorfo',

  // Navegação
  'Overview': 'Visão Geral',
  'Tokenomics': 'Tokenomics',
  'Races': 'Raças',
  'Classes': 'Classes',
  'Attributes & Stats': 'Atributos & Stats',
  'Progression & XP': 'Progressão & XP',
  'Combat': 'Combate',
  'Transformations': 'Transformações',
  'PvP': 'PvP',
  'PvE & Dungeons': 'PvE & Masmorras',
  'Items': 'Itens',
  'Enhancement': 'Aprimoramento',
  'Materials & Crafting': 'Materiais & Crafting',
  'Stamina': 'Stamina',
  'AI & Images': 'IA & Imagens',
  'Notes & Roadmap': 'Notas & Roadmap',

  // Changelog resolvido
  'Tokenomics v2 in the contracts: DOL with a fixed 1B supply (no mint), burnable GOLD and a market fee with real burn (4% items / 5% characters).':
    'Tokenomics v2 nos contratos: DOL com supply fixo de 1B (sem mint), GOLD queimável e taxa de mercado com queima real (4% itens / 5% personagens).',
  'Tokenomics dashboard published at /tokenomics/dashboard.html (120-month projection, 3 scenarios).':
    'Dashboard de tokenomics publicado em /tokenomics/dashboard.html (projeção de 120 meses, 3 cenários).',
  'The old dungeon system (rank F–S monsters) was removed — only the MATERIALS in dungeonData.ts remain.':
    'Sistema antigo de masmorras (monstros rank F–S) removido — restam só os MATERIAIS em dungeonData.ts.',
  'Points per level standardised at 1/level (pointSystem.leveling aligned with characterLevelSystem).':
    'Pontos por nível padronizados em 1/nível (pointSystem.leveling alinhado ao characterLevelSystem).',
  'The wisdom attribute was removed from types/game.ts, gameData.ts and characterFactory.ts (simplification).':
    'Atributo wisdom removido de types/game.ts, gameData.ts e characterFactory.ts (simplificação).',
  'The doc now imports straight from the pure sources — balancing edits are reflected here automatically.':
    'Doc agora importa direto das fontes puras — edições de balanceamento refletem aqui automaticamente.',
  'The doc was made public and shown on the landing page.': 'Doc tornado público e exibido na landing.',

  // Roadmap
  'Deploy of the v2 contracts (Amoy → mainnet)': 'Deploy dos contratos v2 (Amoy → mainnet)',
  'DolToken v2 (fixed 1B), burnable GOLD and both markets with a fee are ready and tested in the repository. What is left is redeploying on Amoy (new addresses in the envs) and, right after the economic go-live, on Polygon mainnet.':
    'DolToken v2 (1B fixo), GOLD queimável e os dois mercados com taxa já estão prontos e testados no repositório. Falta redeployar na Amoy (novos endereços nas envs) e, na sequência do go-live econômico, na mainnet Polygon.',
  'Weekly adventures (PvE) — implementation': 'Aventuras semanais (PvE) — implementação',
  "The gear of the 4 weekly bosses is already catalogued (Krax-thar, Vol'theris, Gorthak, Sylariel). What is left is the mode itself: rotation by Saturday (week 1–4), the boss encounter and the exclusive drop table (source adventure_boss).":
    'Gear dos 4 chefes semanais já catalogado (Krax-thar, Vol\'theris, Gorthak, Sylariel). Falta implementar o modo em si: rotação por sábado (semana 1–4), encontro do chefe e a tabela de drop exclusiva (source adventure_boss).',
  'Align the stat source on the server': 'Alinhar fonte de stats no servidor',
  'Creation uses characterCreationData.ts (newer, rebalanced), but the server (api/character/route.ts) still computes stats from gameData.ts. Consolidate into a single source after the test battery.':
    'A criação usa characterCreationData.ts (mais nova, rebalanceada), mas o servidor (api/character/route.ts) ainda computa stats por gameData.ts. Consolidar numa fonte única após a bateria de testes.',
  'Tune the stamina costs': 'Afinar custos de stamina',
  'Passive regen is implemented (+2/15s after 15 min without spending). What is left is the test battery to measure whether the spend per activity is high or low and calibrate the costs.':
    'Regen passivo implementado (+2/15s após 15 min sem gastar). Falta a bateria de testes para medir se o gasto por atividade está alto ou baixo e calibrar os custos.',
  'AI: image generation (Anthropic)': 'IA: geração de imagens (Anthropic)',
  'Migrate to our own Anthropic key and generate character images in the SAME style, adding only the traits the player chooses. Improve the prompt for consistency.':
    'Migrar para chave Anthropic própria e gerar imagens de personagem no MESMO estilo, adicionando apenas as características que o player escolher. Melhorar o prompt para consistência.',
  'Pending PvP rewards': 'Recompensas PvP pendentes',
  'Implement win streak, first win of the day, database persistence and the rewards UI (marked TODO today).':
    'Implementar win streak, primeira vitória do dia, persistência em banco e UI de recompensas (hoje marcados como TODO).',

  // Hero
  '📖 Official documentation · v1.0 · public': '📖 Documentação oficial · v1.0 · pública',
  'Complete reference for the tokenized RPG of Dolrath. The numbers here are read straight from the game source — this page is a living mirror of the current balancing.':
    'Referência completa do RPG tokenizado de Dolrath. Os números aqui são lidos diretamente do código-fonte do jogo — esta página é um espelho vivo do balanceamento atual.',
  'Updated {date}': 'Atualizado {date}',
  'Next.js 14 · Prisma · Wallet login (SIWE)': 'Next.js 14 · Prisma · Login por carteira (SIWE)',
  'Polygon (Amoy/Mainnet)': 'Polygon (Amoy/Mainnet)',
  'Source: data imported from the code': 'Fonte: dados importados do código',
  'Contents': 'Conteúdo',

  // Visão geral
  'Introduction': 'Introdução',
  ' is a turn-based combat RPG inspired by': ' é um RPG de combate por turnos inspirado em',
  'tokenized on-chain': 'tokenizados on-chain',
  ', where characters, items and currency are ': ', onde personagens, itens e moeda são ',
  '. An AI narrates the combat, and progression happens in PvP (real time over socket) and PvE (dungeons with d20 events).':
    '. Uma IA narra o combate, e a progressão acontece em PvP (tempo real via socket) e PvE (masmorras com eventos de d20).',
  'Character = NFT': 'Personagem = NFT',
  'Created by paying DOL, mintable as ERC-721 and tradable on an on-chain market.':
    'Criados pagando DOL, mintáveis como ERC-721 e negociáveis num mercado on-chain.',
  'Tactical combat': 'Combate tático',
  'Dice (d6–d20), critical from AGI, dodge from SPEED and block from RES.':
    'Dados (d6–d20), crítico por AGI, esquiva por SPEED e bloqueio por RES.',
  'Dual economy': 'Economia dupla',
  'GOLD (elastic, earned by playing) for items and crafting; DOL (fixed 1B supply) for creation, characters, staking and governance.':
    'GOLD (elástico, ganho jogando) para itens e crafting; DOL (supply fixo de 1B) para criação, personagens, staking e governança.',
  'Main loop': 'Loop principal',

  // Tokenomics
  'Economy': 'Economia',
  'Economy ': 'Economia ',
  'dual-token': 'dual-token',
  ' on Polygon: ': ' em Polygon: ',
  ' is the long-term asset (fixed supply, governance, staking) and ': ' é o ativo de longo prazo (supply fixo, governança, staking) e ',
  ' is the elastic gameplay currency, earned by playing and spent in the shop, forge, alchemy and item market. Separating the two protects the value of DOL from the sell pressure of the grind — the lesson of the play-to-earn games that died inflating their main token.':
    ' é a moeda elástica do gameplay, ganha jogando e gasta em loja, forja, alquimia e mercado de itens. Separar as duas protege o valor do DOL da pressão de venda do grind — a lição dos play-to-earn que morreram inflacionando o token principal.',
  'DOL — long-term asset': 'DOL — ativo de longo prazo',
  'fixed supply of 1,000,000,000': 'supply fixo de 1.000.000.000',
  ' — ': ' — ',
  ', minted once at deploy. ': ', cunhado uma única vez no deploy. ',
  'There is no mint function': 'Não existe função de mint',
  ': the supply can only go down (burns). On-chain name: ': ': o supply só pode diminuir (queimas). Nome on-chain: ',
  'DOL is not pegged to the dollar.': 'DOL não é pareado ao dólar.',
  ' It is not a stablecoin, has no backing, is not redeemable and the studio does not buy it back. The one paying in dollars is the player buying the hero — and that dollar is revenue, it does not become a prize for anyone.':
    ' Não é stablecoin, não tem lastro, não é resgatável e o estúdio não recompra. Quem paga em dólar é o jogador comprando o herói — e esse dólar é receita, não vira prêmio para ninguém.',
}
