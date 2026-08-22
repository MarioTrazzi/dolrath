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

  // Tokenomics — DOL / GOLD
  'Character creation: ': 'Criação de personagem: ',
  ' 100% revenue': ' 100% receita',
  ': NFT, AI portrait and infra.': ': NFT, retrato por IA e infra.',
  'Ranking prizes': 'Premiação por ranking',
  ' — today the arena scoreboard is ': ' — hoje o placar da arena é ',
  'global, permanent and prizeless': 'global, permanente e sem prêmio',
  ': no entry, no pool, no payout. The reward system will be redesigned.':
    ': nenhuma inscrição, nenhuma pool, nenhum pagamento. O sistema de recompensa será redesenhado.',
  'The character market trades in DOL (5% fee: 2.5% burn + 2.5% treasury)':
    'Mercado de personagens negocia em DOL (taxa 5%: 2,5% queima + 2,5% treasury)',
  'Staking with veDOL': 'Staking com veDOL',
  'Governance (DAO)': 'Governança (DAO)',
  'GOLD — gameplay currency': 'GOLD — moeda do gameplay',
  ' — elastic issuance ': ' — emissão elástica ',
  'gated by gameplay': 'gateada por gameplay',
  ': every GOLD is born off-chain (server-authoritative, stamina, daily cap) and only becomes a token when the player ':
    ': todo GOLD nasce off-chain (servidor-autoritativo, stamina, teto diário) e só vira token quando o jogador ',
  ' claims it on-chain': ' reivindica on-chain',
  ', claim fee 0%).': ', taxa de claim 0%).',
  'Earned in PvE (dungeons), PvP and events': 'Ganho em PvE (masmorras), PvP e eventos',
  'Spent in the shop, forge, alchemy and item market': 'Gasto em loja, forja, alquimia e mercado de itens',
  'Issuance cap: ': 'Teto de emissão: ',
  '20,000/day per user': '20.000/dia por usuário',
  'GOLD flow — three layers': 'Fluxo do GOLD — três camadas',
  'The sinks hit the balance ': 'Os sinks atacam o saldo ',
  'before': 'antes',
  ' the claim: in practice only 20–40% of the GOLD earned becomes a token. The exit (claim) is not taxed; ':
    ' do claim: na prática só 20–40% do GOLD ganho vira token. A saída (claim) não é taxada; a ',
  'circulation': 'circulação',
  ' is — the fee lives in the market, not at the door.': ' é — a taxa vive no mercado, não na porta.',

  // Alocação
  'DOL allocation (1B, fixed supply)': 'Alocação do DOL (1B, supply fixo)',
  'Bucket': 'Bucket',
  'Vesting': 'Vesting',
  'issuance of 25% of the remaining balance/year (year 1: 75M, year 2: 56M…)':
    'emissão de 25% do saldo restante/ano (ano 1: 75M, ano 2: 56M…)',
  'Treasury / DAO': 'Treasury / DAO',
  'linear over 48 months': 'linear em 48 meses',
  'Team': 'Equipe',
  '12-month cliff + 36-month linear': 'cliff 12 meses + linear 36 meses',
  'Investors': 'Investidores',
  '6-month cliff + 24-month linear': 'cliff 6 meses + linear 24 meses',
  'Liquidity': 'Liquidez',
  '25% at TGE, the rest as needed (LP with lock)': '25% no TGE, resto conforme necessidade (LP com lock)',
  'Ecosystem': 'Ecossistema',
  'partnerships, grants and integrations': 'parcerias, grants e integrações',
  'Community': 'Comunidade',
  '40% at TGE (airdrops, launch events)': '40% no TGE (airdrops, eventos de lançamento)',
  'Issuance to players decays 25% per year over the remaining balance of the bucket — it never drops to zero suddenly, never explodes. Full detail in the ':
    'A emissão a jogadores decai 25% ao ano sobre o saldo restante do bucket — nunca zera de repente, nunca explode. Detalhe completo no ',
  ' of the repository.': ' do repositório.',

  // Taxas
  'Fees & burns': 'Taxas & queimas',
  'Where': 'Onde',
  'Fee': 'Taxa',
  'Destination': 'Destino',
  'Status': 'Status',
  'Item market (GOLD)': 'Mercado de itens (GOLD)',
  '2% real burn + 2% treasury': '2% queima real + 2% treasury',
  'Character market (DOL)': 'Mercado de personagens (DOL)',
  '2.5% real burn + 2.5% treasury': '2,5% queima real + 2,5% treasury',
  'Forge (gear craft)': 'Forja (craft de equipamento)',
  '30% of catalog value (min. 10)': '30% do valor de catálogo (mín. 10)',
  'off-chain sink': 'sink off-chain',
  'Alchemy (potion craft)': 'Alquimia (craft de poções)',
  '30% of the value (min. 5)': '30% do valor (mín. 5)',
  'Selling an item to the shop (NPC)': 'Venda de item à loja (NPC)',
  'buyback at 60% of catalog': 'recompra a 60% do catálogo',
  'off-chain sink (40%)': 'sink off-chain (40%)',
  'On-chain GOLD claim': 'Claim de GOLD on-chain',
  '0% (gas only)': '0% (só gas)',
  'Season passes in DOL': 'Passes de temporada em DOL',
  '50% burned': '50% queimado',
  'burn + treasury': 'queima + treasury',
  'Primary collections (NFT)': 'Coleções primárias (NFT)',
  '100% of the primary sale': '100% da venda primária',
  'partial burn + treasury': 'queima parcial + treasury',
  'Quarterly buyback': 'Buyback trimestral',
  'set by the DAO': 'definido pela DAO',
  'burn': 'queima',
  'The fees of both markets are in the contract (': 'As taxas dos dois mercados estão no contrato (',
  ', hard cap of 10%) and the burn is ': ', teto rígido de 10%) e a queima é ',
  'real destruction of supply': 'destruição real de supply',
  '), not a dead wallet.': '), não carteira morta.',

  // Staking / liquidez
  'DOL staking (veDOL)': 'Staking de DOL (veDOL)',
  'Locks from 3 to 24 months — the longer, the more weight (veDOL)':
    'Locks de 3 a 24 meses — quanto mais longo, mais peso (veDOL)',
  'Reward: 20% of each issuance epoch + 50% of the treasury fees':
    'Recompensa: 20% de cada epoch de emissão + 50% das taxas do treasury',
  'No fixed APY promised': 'Sem APY fixo prometido',
  ' — the yield comes from real game revenue': ' — o yield vem de receita real do jogo',
  'Liquidity — official stance': 'Liquidez — postura oficial',
  'The official pair with project liquidity (and LP lock) is ': 'O par oficial com liquidez do projeto (e lock de LP) é ',
  'DOL only': 'só do DOL',
  '. GOLD is worth what it buys inside the game: the project ': '. O GOLD vale pelo que compra dentro do jogo: o projeto ',
  'does not subsidise': 'não subsidia',
  ' external GOLD price. A GOLD/DOL pair may exist through natural market arbitrage.':
    ' preço externo de GOLD. Um par GOLD/DOL pode existir por arbitragem natural do mercado.',

  // Roadmap econômico
  'Economic roadmap': 'Roadmap econômico',
  'Stage': 'Etapa',
  'What': 'O quê',
  'E0 — Foundation': 'E0 — Fundação',
  'Off-chain GOLD with a daily cap, sinks (shop/forge/alchemy), signed claim':
    'GOLD off-chain com teto diário, sinks (loja/forja/alquimia), claim assinado',
  'E1 — v2 contracts': 'E1 — Contratos v2',
  'DOL fixed 1B supply, market fees with real burn (mainnet deploy pending)':
    'DOL supply fixo 1B, taxas de mercado com queima real (deploy mainnet pendente)',
  '🚧 CONTRACTS READY': '🚧 CONTRATOS PRONTOS',
  'E2 — TGE & liquidity': 'E2 — TGE & liquidez',
  'DOL distribution, official pair with LP lock, listing':
    'Distribuição do DOL, par oficial com LP lock, listagem',
  'E3 — Staking': 'E3 — Staking',
  'veDOL, epochs, treasury fee distribution': 'veDOL, epochs, distribuição de taxas do treasury',
  'E4 — DAO': 'E4 — DAO',
  'Governance over treasury, buyback and economic parameters':
    'Governança sobre treasury, buyback e parâmetros econômicos',
  'E5 — Expansion': 'E5 — Expansão',
  'Guilds, land, raids and seasons plugged into the same sinks':
    'Guildas, terrenos, raids e seasons plugados nos mesmos sinks',

  // Contratos
  'On-chain contracts': 'Contratos on-chain',
  'Contract': 'Contrato',
  'Standard': 'Padrão',
  'Function': 'Função',
  'DOL — fixed 1B supply, no mint, burnable': 'DOL — supply fixo 1B, sem mint, burnable',
  'GOLD — claim by EIP-712 signature, burnable': 'GOLD — claim por assinatura EIP-712, burnable',
  'Characters as NFT (paid mint + signature)': 'Personagens como NFT (mint pago + assinatura)',
  'Items as NFT (holds the GOLD paid at mint)': 'Itens como NFT (guarda GOLD pago no mint)',
  'Market': 'Market',
  'Escrow + sale in DOL · 5% fee (2.5% burn / 2.5% treasury)':
    'Escrow + venda por DOL · taxa 5% (2,5% burn / 2,5% treasury)',
  'Escrow + sale in GOLD · 4% fee (2% burn / 2% treasury)':
    'Escrow + venda por GOLD · taxa 4% (2% burn / 2% treasury)',
  'Mints and claims require a ': 'Mints e claims exigem ',
  'server signature': 'assinatura do servidor',
  ' (EIP-712) to prevent arbitrary minting; the markets use ': ' (EIP-712) para impedir cunhagem arbitrária; os mercados usam ',
  ' and NFT escrow.': ' e escrow do NFT.',
  '📊 Tokenomics dashboard': '📊 Dashboard de tokenomics',
  'Deterministic 120-month projection (3 scenarios: pessimistic/base/optimistic) — DOL circulation, issuance × burn, staking, treasury, player growth and market cap per price assumption.':
    'Projeção determinística de 120 meses (3 cenários: pessimista/base/otimista) — circulação do DOL, emissão × queima, staking, treasury, crescimento de jogadores e market cap por premissa de preço.',
  'Open the interactive dashboard →': 'Abrir dashboard interativo →',

  // Raças / classes
  'Character': 'Personagem',
  'Four playable races. Draconian and Shapeshifter have a transformation; Human and Elf receive compensating buffs.':
    'Quatro raças jogáveis. Draconiano e Metamorfo têm transformação; Humano e Elfo recebem buffs compensatórios.',
  '⚠️ display values': '⚠️ valores de exibição',
  ' The numbers below come from ': ' Os números abaixo vêm de ',
  ' (a newer file, shown on the creation screen — the ': ' (arquivo mais novo, mostrado na tela de criação — a ',
  'rebalanced intent': 'intenção rebalanceada',
  '). Today the server still computes the real stats from ': '). Hoje o servidor ainda calcula os stats reais por ',
  '; aligning the two sources is on the roadmap.': '; alinhar as duas fontes está no roadmap.',
  'Base: ': 'Base: ',
  'Racial bonus: ': 'Bônus racial: ',
  'Transformation: ': 'Transformação: ',
  'Restrictions: ': 'Restrições: ',
  'None': 'Nenhuma',
  'The class defines attribute bonuses, allowed weapons and thematic abilities.':
    'A classe define bônus de atributo, armas permitidas e habilidades temáticas.',

  // Classes / atributos / progressão
  'Class': 'Classe',
  'Description': 'Descrição',
  'Bonus': 'Bônus',
  'Weapons': 'Armas',
  'Abilities': 'Habilidades',
  'System': 'Sistema',
  'Primary attributes feed derived combat stats. Distribute points at creation and at every level.':
    'Atributos primários alimentam stats de combate derivados. Distribua pontos na criação e a cada nível.',
  'Primary attributes': 'Atributos primários',
  ' strength — physical damage, HP/STA': ' força — dano físico, HP/STA',
  ' agility — critical, speed, dodge, MP': ' agilidade — crítico, velocidade, esquiva, MP',
  ' intelligence — magic damage, MP': ' inteligência — dano mágico, MP',
  ' resistance — defense, block and stamina': ' resistência — defesa, bloqueio e stamina',
  'Derived stats': 'Stats derivados',
  'Point distribution': 'Distribuição de pontos',
  'Creation:': 'Criação:',
  ' free points, max. ': ' pontos livres, máx. ',
  ' per stat (1 point = 1 stat).': ' por stat (1 ponto = 1 stat).',
  'Level up:': 'Level up:',
  ' point per level.': ' ponto por nível.',
  'A smooth exponential curve up to max level 100. Levelling up recalculates HP/MP/STA and grants points.':
    'Curva exponencial suave até o nível máximo 100. Subir de nível recalcula HP/MP/STA e concede pontos.',
  'Level': 'Nível',
  'XP to next': 'XP p/ próximo',
  'Values computed in real time by ': 'Valores calculados em tempo real por ',

  // Combate
  'Mechanics': 'Mecânicas',
  'Combat System': 'Sistema de Combate',
  'Round-based combat: the attacker chooses an offensive action and the defender reacts (dodge or block). Everything goes through dice rolls.':
    'Combate por rodadas: o atacante escolhe ação ofensiva e o defensor reage (esquivar ou bloquear). Tudo passa por rolagens de dado.',
  'Actions & dice': 'Ações & dados',
  'Action': 'Ação',
  'Die': 'Dado',
  'Base damage': 'Dano base',
  'Light attack': 'Ataque leve',
  'Heavy attack': 'Ataque pesado',
  'Special attack': 'Ataque especial',
  'Dodge': 'Esquivar',
  'Defend/Block': 'Defender/Bloquear',
  'Damage formula': 'Fórmula de dano',
  'Dodge (SPEED)': 'Esquiva (SPEED)',
  'Block (RES)': 'Bloqueio (RES)',
  'Gear bonuses come in already scaled by the enhancement level. Source: ':
    'Bônus de equipamento entram já escalados pelo nível de aprimoramento. Fonte: ',
  'Limited abilities that temporarily change stats and unlock exclusive skills. They cost MP + Stamina, with a duration and a cooldown in turns.':
    'Habilidades limitadas que alteram stats temporariamente e liberam skills exclusivas. Custam MP + Stamina, com duração e cooldown em turnos.',
  'Modifiers:': 'Modificadores:',
  'Resists:': 'Resiste:',
  'Vulnerable:': 'Vulnerável:',
}
