// 📦 Catálogo de Itens do Dolrath — fonte única de verdade
//
// Itens são divididos por COMO são obtidos (princípio de design):
//  - 🏪 Loja (NPC):  equipamento básico→intermediário (COMMON, "Superior"=UNCOMMON)
//                    e consumíveis básicos/intermediários. Sustenta early/mid-game.
//  - 🗝️ Masmorras & Aventuras: tudo RARO+ (acessórios, melhores consumíveis e gear
//                    de raça). ÉPICO e LENDÁRIO caem APENAS de chefes.
//  - 🗓️ Aventuras semanais: 4 chefes únicos (1 por sábado) com gear nomeado
//                    (modelo Black Desert: Kzarka, Garmoth, Karanda...).
//
// Cada item declara:
//  - rarity:          COMMON | UNCOMMON | RARE | EPIC | LEGENDARY
//  - source:          shop | dungeon | dungeon_boss | adventure_boss
//  - dungeons:        ids das masmorras onde cai (vazio para itens de loja)
//  - raceRestriction: (opcional) só esta raça pode EQUIPAR/encontrar o item
//  - build:           (loja) arquétipo de distribuição de atributos
//  - adventureBoss:   (aventura) nome do chefe semanal que dropa o item
//
// Sem dependência de Prisma/React para poder ser usado no servidor, no
// seed (Node) e no cliente (diálogo de exploração / página /doc).

export type Rarity = 'COMMON' | 'UNCOMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
export type RaceId = 'draconiano' | 'metamorfo' | 'humano' | 'elfo';

// Como o item é obtido.
export type ItemSource = 'shop' | 'dungeon' | 'dungeon_boss' | 'adventure_boss';

// Arquétipo de build dos itens de loja (mesma potência, distribuição diferente).
export type BuildArchetype = 'brute' | 'agile' | 'arcane' | 'guardian';

// Ids das 4 masmorras ativas (fonte: dungeonAdventures.ts).
export type DungeonId = 'floresta' | 'caverna' | 'pantano' | 'ruinas';

// Mesmos valores do enum ItemType do Prisma (string).
export type ItemTypeStr =
  | 'SWORD' | 'AXE' | 'DAGGER' | 'STAFF' | 'BOW'
  | 'LIGHT_ARMOR' | 'MEDIUM_ARMOR' | 'HEAVY_ARMOR'
  | 'LIGHT_HELMET' | 'MEDIUM_HELMET' | 'HEAVY_HELMET'
  | 'LIGHT_GLOVES' | 'MEDIUM_GLOVES' | 'HEAVY_GLOVES'
  | 'LIGHT_BOOTS' | 'MEDIUM_BOOTS' | 'HEAVY_BOOTS'
  | 'RING' | 'NECKLACE' | 'SHIELD';

export interface CatalogItem {
  name: string;
  description: string;
  type: ItemTypeStr;
  level: number;
  rarity: Rarity;
  stats: Record<string, any>;
  goldPrice: number;
  /** Como o item é obtido. */
  source: ItemSource;
  /** Masmorras onde o item pode cair (vazio para itens de loja). */
  dungeons: string[];
  /** Se definido, apenas esta raça pode encontrar/equipar o item. */
  raceRestriction?: RaceId;
  /** (loja) arquétipo de distribuição de atributos. */
  build?: BuildArchetype;
  /** (aventura) nome do chefe semanal que dropa o item. */
  adventureBoss?: string;
}

// === CATÁLOGO DE EQUIPAMENTOS ===

export const ITEM_CATALOG: CatalogItem[] = [
  // ============================================================
  // 🏪 LOJA — ARMAS (4 variantes por tier; mesma potência, builds diferentes)
  //   Builds: brute(STR) · agile(AGI) · arcane(INT) · guardian(STR+DEF)
  // ============================================================

  // ---------- COMUM (nível 1–4) ----------
  {
    name: 'Espada de Recruta', description: 'Lâmina de ferro padrão da guarda. Equilíbrio e confiança para quem começa.',
    type: 'SWORD', level: 1, rarity: 'COMMON', goldPrice: 110, source: 'shop', build: 'brute', dungeons: [],
    stats: { str: 3, bonusDamage: 6 },
  },
  {
    name: 'Adaga Ligeira', description: 'Leve e afiada, premia reflexos rápidos e golpes em sequência.',
    type: 'DAGGER', level: 1, rarity: 'COMMON', goldPrice: 95, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 3, bonusDamage: 4, bonusSpeed: 4 },
  },
  {
    name: 'Cajado de Aprendiz', description: 'Madeira tratada que conduz as primeiras faíscas arcanas.',
    type: 'STAFF', level: 1, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'arcane', dungeons: [],
    stats: { int: 3, mp: 10, bonusDamage: 3 },
  },
  {
    name: 'Machado do Guarda', description: 'Pesado e estável; troca velocidade por impacto e firmeza.',
    type: 'AXE', level: 2, rarity: 'COMMON', goldPrice: 120, source: 'shop', build: 'guardian', dungeons: [],
    stats: { str: 2, def: 2, hp: 8, bonusDamage: 5 },
  },

  // ---------- SUPERIOR (UNCOMMON, nível 5–11) ----------
  {
    name: 'Espada do Veterano', description: 'Aço temperado de quem já viu batalhas. Corte limpo e poderoso.',
    type: 'SWORD', level: 6, rarity: 'UNCOMMON', goldPrice: 420, source: 'shop', build: 'brute', dungeons: [],
    stats: { str: 5, bonusDamage: 11 },
  },
  {
    name: 'Arco do Batedor', description: 'Arco composto para o combatente ágil que prefere a distância.',
    type: 'BOW', level: 6, rarity: 'UNCOMMON', goldPrice: 410, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 5, bonusDamage: 10, bonusSpeed: 5 },
  },
  {
    name: 'Cajado Rúnico', description: 'Runas gravadas amplificam o fluxo de mana do conjurador.',
    type: 'STAFF', level: 7, rarity: 'UNCOMMON', goldPrice: 450, source: 'shop', build: 'arcane', dungeons: [],
    stats: { int: 5, mp: 18, bonusDamage: 8 },
  },
  {
    name: 'Machado de Guerra', description: 'Cabeça maciça que esmaga defesas. Para quem segura a linha de frente.',
    type: 'AXE', level: 8, rarity: 'UNCOMMON', goldPrice: 480, source: 'shop', build: 'guardian', dungeons: [],
    stats: { str: 4, def: 3, hp: 16, bonusDamage: 9 },
  },

  // ============================================================
  // 🏪 LOJA — ARMADURA DE CORPO (4 variantes por tier)
  //   Peso da peça define quais raças podem equipar (canRaceEquip).
  // ============================================================

  // ---------- COMUM (nível 1–4) ----------
  {
    name: 'Gibão de Couro', description: 'Leve e flexível; prioriza mobilidade e esquiva.',
    type: 'LIGHT_ARMOR', level: 1, rarity: 'COMMON', goldPrice: 130, source: 'shop', build: 'agile', dungeons: [],
    stats: { def: 3, agi: 2, hp: 8, bonusSpeed: 5 },
  },
  {
    name: 'Túnica de Linho Arcano', description: 'Tecido fino tratado com sais mágicos. Favorece conjuradores.',
    type: 'LIGHT_ARMOR', level: 1, rarity: 'COMMON', goldPrice: 120, source: 'shop', build: 'arcane', dungeons: [],
    stats: { def: 2, int: 3, mp: 12 },
  },
  {
    name: 'Cota Acolchoada', description: 'Proteção equilibrada que qualquer raça pode vestir.',
    type: 'MEDIUM_ARMOR', level: 2, rarity: 'COMMON', goldPrice: 160, source: 'shop', build: 'agile', dungeons: [],
    stats: { def: 4, hp: 12, agi: 1 },
  },
  {
    name: 'Peitoral de Ferro', description: 'Placa frontal robusta para quem encara o dano de frente.',
    type: 'HEAVY_ARMOR', level: 3, rarity: 'COMMON', goldPrice: 200, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 6, hp: 18, bonusDefense: 6 },
  },

  // ---------- SUPERIOR (UNCOMMON, nível 5–11) ----------
  {
    name: 'Armadura de Couro Batido', description: 'Couro endurecido em camadas; ágil sem abrir mão da proteção.',
    type: 'LIGHT_ARMOR', level: 6, rarity: 'UNCOMMON', goldPrice: 480, source: 'shop', build: 'agile', dungeons: [],
    stats: { def: 6, agi: 4, hp: 18, bonusSpeed: 8 },
  },
  {
    name: 'Vestes do Conjurador', description: 'Bordadas com fios de prata que canalizam mana.',
    type: 'LIGHT_ARMOR', level: 7, rarity: 'UNCOMMON', goldPrice: 460, source: 'shop', build: 'arcane', dungeons: [],
    stats: { def: 4, int: 5, mp: 22, bonusDefense: 4 },
  },
  {
    name: 'Brigantina Reforçada', description: 'Placas rebitadas em couro; o meio-termo versátil para todos.',
    type: 'MEDIUM_ARMOR', level: 8, rarity: 'UNCOMMON', goldPrice: 560, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 8, hp: 25, agi: 2, bonusDefense: 8 },
  },
  {
    name: 'Couraça de Aço', description: 'Armadura completa de placas. Muralha ambulante.',
    type: 'HEAVY_ARMOR', level: 10, rarity: 'UNCOMMON', goldPrice: 680, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 11, hp: 35, str: 2, bonusDefense: 12 },
  },

  // ============================================================
  // 🏪 LOJA — EQUIPAMENTO DE APOIO (elmo/luvas/botas/escudo, leve+pesado)
  //   Completa o conjunto da cabeça aos pés. Escudo é universal.
  // ============================================================

  // ---------- COMUM ----------
  {
    name: 'Capuz de Couro', description: 'Cobertura leve para a cabeça, sem atrapalhar a visão.',
    type: 'LIGHT_HELMET', level: 1, rarity: 'COMMON', goldPrice: 70, source: 'shop', build: 'agile', dungeons: [],
    stats: { def: 2, agi: 1, bonusSpeed: 2 },
  },
  {
    name: 'Elmo de Ferro', description: 'Casco metálico que absorve impactos na cabeça.',
    type: 'HEAVY_HELMET', level: 2, rarity: 'COMMON', goldPrice: 95, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 4, hp: 8, bonusDefense: 4 },
  },
  {
    name: 'Luvas de Couro', description: 'Boa pegada e proteção básica para as mãos.',
    type: 'LIGHT_GLOVES', level: 1, rarity: 'COMMON', goldPrice: 65, source: 'shop', build: 'agile', dungeons: [],
    stats: { def: 1, agi: 2, bonusSpeed: 3 },
  },
  {
    name: 'Manoplas de Ferro', description: 'Mãos blindadas para quem dá e recebe golpes pesados.',
    type: 'HEAVY_GLOVES', level: 2, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 3, str: 1, bonusDamage: 3 },
  },
  {
    name: 'Botas de Viajante', description: 'Solado firme para longas caminhadas e fugas rápidas.',
    type: 'LIGHT_BOOTS', level: 1, rarity: 'COMMON', goldPrice: 65, source: 'shop', build: 'agile', dungeons: [],
    stats: { def: 1, agi: 2, bonusSpeed: 4 },
  },
  {
    name: 'Botas de Placa', description: 'Pesadas, mas mantêm o portador firme no chão.',
    type: 'HEAVY_BOOTS', level: 2, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 3, hp: 8, bonusDefense: 3 },
  },
  {
    name: 'Escudo de Madeira', description: 'Tábuas reforçadas que aparam os primeiros golpes.',
    type: 'SHIELD', level: 1, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 2, bonusDefense: 4 },
  },

  // ---------- SUPERIOR (UNCOMMON) ----------
  {
    name: 'Coif de Malha', description: 'Capuz de anéis entrelaçados; leve proteção sem perder agilidade.',
    type: 'LIGHT_HELMET', level: 6, rarity: 'UNCOMMON', goldPrice: 300, source: 'shop', build: 'agile', dungeons: [],
    stats: { def: 4, agi: 3, mp: 6, bonusSpeed: 4 },
  },
  {
    name: 'Elmo do Sentinela', description: 'Visor reforçado que protege rosto e pescoço.',
    type: 'HEAVY_HELMET', level: 8, rarity: 'UNCOMMON', goldPrice: 380, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 7, hp: 18, bonusDefense: 8 },
  },
  {
    name: 'Luvas de Malha', description: 'Articuladas e leves, ideais para empunhar qualquer arma.',
    type: 'LIGHT_GLOVES', level: 6, rarity: 'UNCOMMON', goldPrice: 290, source: 'shop', build: 'agile', dungeons: [],
    stats: { def: 3, agi: 4, bonusSpeed: 5 },
  },
  {
    name: 'Manoplas do Sentinela', description: 'Placas articuladas que somam soco e bloqueio.',
    type: 'HEAVY_GLOVES', level: 8, rarity: 'UNCOMMON', goldPrice: 360, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 5, str: 3, bonusDamage: 6 },
  },
  {
    name: 'Botas de Malha', description: 'Passos silenciosos e protegidos.',
    type: 'LIGHT_BOOTS', level: 6, rarity: 'UNCOMMON', goldPrice: 290, source: 'shop', build: 'agile', dungeons: [],
    stats: { def: 3, agi: 4, bonusSpeed: 8 },
  },
  {
    name: 'Grevas de Aço', description: 'Pernas blindadas que reduzem quedas e empurrões.',
    type: 'HEAVY_BOOTS', level: 8, rarity: 'UNCOMMON', goldPrice: 360, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 6, hp: 16, bonusDefense: 6 },
  },
  {
    name: 'Escudo de Ferro', description: 'Disco de ferro batido, resistente a golpes pesados.',
    type: 'SHIELD', level: 5, rarity: 'UNCOMMON', goldPrice: 350, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 4, bonusDefense: 8 },
  },

  // ============================================================
  // 🗝️ MASMORRAS — GEAR DE RAÇA (4 tipos por raça: Raro→Lendário)
  //   Raros caem no chão; ÉPICO e LENDÁRIO só de CHEFE de masmorra.
  //   Masmorras: floresta(1★) · caverna(2★) · pantano(3★) · ruinas(4★)
  // ============================================================

  // 🐉 DRACONIANO — pesado, fogo, STR/HP
  {
    name: 'Lâmina das Brasas', description: 'Forjada em magma; a lâmina nunca esfria nas mãos de um dracônico.',
    type: 'SWORD', level: 14, rarity: 'RARE', goldPrice: 1500, source: 'dungeon', raceRestriction: 'draconiano',
    stats: { str: 7, bonusDamage: 16, specialEffect: 'Chance de causar dano de fogo' }, dungeons: ['caverna'],
  },
  {
    name: 'Couraça de Escamas Ígneas', description: 'Escamas sobrepostas que fervem ao toque inimigo.',
    type: 'HEAVY_ARMOR', level: 16, rarity: 'RARE', goldPrice: 1800, source: 'dungeon', raceRestriction: 'draconiano',
    stats: { def: 10, hp: 35, str: 3, bonusDefense: 16 }, dungeons: ['pantano'],
  },
  {
    name: 'Égide do Dragão Ancião', description: 'Couraça das escamas de um dragão milenar. Só um descendente suporta seu peso ardente.',
    type: 'HEAVY_ARMOR', level: 24, rarity: 'EPIC', goldPrice: 3400, source: 'dungeon_boss', raceRestriction: 'draconiano',
    stats: { def: 14, hp: 55, str: 5, bonusDefense: 22, specialEffect: 'Imunidade parcial a fogo' }, dungeons: ['pantano'],
  },
  {
    name: 'Presas do Cataclismo', description: 'Machado gêmeo feito das presas de um dragão. Pulsa com fúria ancestral.',
    type: 'AXE', level: 30, rarity: 'LEGENDARY', goldPrice: 9000, source: 'dungeon_boss', raceRestriction: 'draconiano',
    stats: { str: 13, bonusDamage: 38, bonusSpeed: 3, specialEffect: 'Explosão ígnea massiva em crítico' }, dungeons: ['ruinas'],
  },

  // 🧝 ELFO — INT/AGI, arco/cajado, leve
  {
    name: 'Arco do Luar Élfico', description: 'Esculpido em madeira-luar; leve como uma folha, certeiro como o destino.',
    type: 'BOW', level: 12, rarity: 'RARE', goldPrice: 1400, source: 'dungeon', raceRestriction: 'elfo',
    stats: { agi: 8, int: 3, bonusDamage: 15, bonusSpeed: 6 }, dungeons: ['floresta'],
  },
  {
    name: 'Vestes do Bosque Celeste', description: 'Folhagem encantada que respira mana junto ao portador.',
    type: 'LIGHT_ARMOR', level: 13, rarity: 'RARE', goldPrice: 1300, source: 'dungeon', raceRestriction: 'elfo',
    stats: { def: 6, int: 6, mp: 25, bonusDefense: 6, specialEffect: 'Regeneração de mana' }, dungeons: ['floresta'],
  },
  {
    name: 'Cajado da Aurora Arcana', description: 'Canaliza a luz das primeiras horas; magia mais barata e brilhante.',
    type: 'STAFF', level: 23, rarity: 'EPIC', goldPrice: 3600, source: 'dungeon_boss', raceRestriction: 'elfo',
    stats: { int: 15, mp: 55, bonusDamage: 24, specialEffect: 'Reduz drasticamente o custo de mana' }, dungeons: ['ruinas'],
  },
  {
    name: 'Manto da Forma Celestial', description: 'Tecido de luz astral que ergue o elfo à sua forma ascendida.',
    type: 'LIGHT_ARMOR', level: 29, rarity: 'LEGENDARY', goldPrice: 9500, source: 'dungeon_boss', raceRestriction: 'elfo',
    stats: { def: 10, int: 12, agi: 8, mp: 60, bonusSpeed: 10, specialEffect: 'Aumenta poder mágico e esquiva' }, dungeons: ['ruinas'],
  },

  // 🐺 METAMORFO — AGI, garras/adaga, leve/médio
  {
    name: 'Garras do Predador', description: 'Garras que se fundem às mãos do metamorfo, afiadas como navalhas.',
    type: 'DAGGER', level: 13, rarity: 'RARE', goldPrice: 1500, source: 'dungeon', raceRestriction: 'metamorfo',
    stats: { agi: 9, str: 3, bonusDamage: 17, bonusSpeed: 9 }, dungeons: ['caverna'],
  },
  {
    name: 'Pelagem Mutável', description: 'Tecido vivo que se adapta à forma e ao instinto do portador.',
    type: 'MEDIUM_ARMOR', level: 14, rarity: 'RARE', goldPrice: 1600, source: 'dungeon', raceRestriction: 'metamorfo',
    stats: { def: 7, agi: 7, hp: 28, bonusSpeed: 10, specialEffect: 'Aumenta a esquiva' }, dungeons: ['pantano'],
  },
  {
    name: 'Manto da Fera Primal', description: 'Carrega o cheiro de mil caçadas; desperta o predador interior.',
    type: 'MEDIUM_ARMOR', level: 22, rarity: 'EPIC', goldPrice: 3400, source: 'dungeon_boss', raceRestriction: 'metamorfo',
    stats: { def: 9, agi: 10, hp: 35, bonusSpeed: 12, specialEffect: 'Esquiva aprimorada' }, dungeons: ['caverna'],
  },
  {
    name: 'Garras do Caçador Lunar', description: 'Brilham sob a lua cheia; cada golpe encadeia o próximo.',
    type: 'DAGGER', level: 28, rarity: 'LEGENDARY', goldPrice: 9200, source: 'dungeon_boss', raceRestriction: 'metamorfo',
    stats: { agi: 14, str: 5, bonusDamage: 36, bonusSpeed: 14, specialEffect: 'Golpes em sequência ignoram parte da defesa' }, dungeons: ['pantano'],
  },

  // ⚔️ HUMANO — versátil, qualquer peso/arma
  {
    name: 'Espada do Andarilho', description: 'Equilibrada para a versatilidade humana — boa em qualquer mão.',
    type: 'SWORD', level: 11, rarity: 'RARE', goldPrice: 1300, source: 'dungeon', raceRestriction: 'humano',
    stats: { str: 6, agi: 5, bonusDamage: 14, bonusSpeed: 4 }, dungeons: ['floresta'],
  },
  {
    name: 'Brigantina do Mercenário', description: 'Proteção confiável de quem vive da espada por contrato.',
    type: 'MEDIUM_ARMOR', level: 12, rarity: 'RARE', goldPrice: 1350, source: 'dungeon', raceRestriction: 'humano',
    stats: { def: 8, hp: 25, agi: 3, bonusDefense: 10 }, dungeons: ['caverna'],
  },
  {
    name: 'Égide do Herói', description: 'Carrega a determinação inquebrável da humanidade.',
    type: 'HEAVY_ARMOR', level: 21, rarity: 'EPIC', goldPrice: 3200, source: 'dungeon_boss', raceRestriction: 'humano',
    stats: { def: 13, hp: 45, str: 4, bonusDefense: 20, specialEffect: 'Reduz dano físico' }, dungeons: ['pantano'],
  },
  {
    name: 'Lâmina do Sétimo Sentido', description: 'Desperta com o portador; corta onde a mente prevê o golpe.',
    type: 'SWORD', level: 28, rarity: 'LEGENDARY', goldPrice: 9500, source: 'dungeon_boss', raceRestriction: 'humano',
    stats: { str: 10, agi: 8, int: 6, bonusDamage: 38, bonusSpeed: 6, specialEffect: 'Ignora parte da defesa e concede XP extra' }, dungeons: ['ruinas'],
  },

  // ============================================================
  // 🗝️ MASMORRAS — ACESSÓRIOS (não vendidos na loja)
  //   4 variantes de cada tipo (ANEL e COLAR), 1 por masmorra.
  //   Épicos só de CHEFE. Sem restrição de raça.
  // ============================================================

  // --- ANÉIS (1 por masmorra) ---
  {
    name: 'Anel da Seiva Ancestral', description: 'Madeira-mãe da Floresta Sombria cristalizada; pulsa vida.',
    type: 'RING', level: 6, rarity: 'RARE', goldPrice: 900, source: 'dungeon', dungeons: ['floresta'],
    stats: { hp: 25, def: 3, specialEffect: 'Regeneração lenta de HP' },
  },
  {
    name: 'Anel de Cristal Pulsante', description: 'Lapidado de um veio vivo da Caverna de Cristal.',
    type: 'RING', level: 12, rarity: 'RARE', goldPrice: 1400, source: 'dungeon', dungeons: ['caverna'],
    stats: { int: 6, mp: 30, bonusDamage: 8, specialEffect: 'Aumenta regeneração de mana' },
  },
  {
    name: 'Anel da Névoa Tóxica', description: 'Condensa os miasmas do Pântano Maldito num aro de osso.',
    type: 'RING', level: 18, rarity: 'EPIC', goldPrice: 2800, source: 'dungeon_boss', dungeons: ['pantano'],
    stats: { agi: 7, bonusSpeed: 8, bonusDamage: 12, specialEffect: 'Chance de envenenar o alvo' },
  },
  {
    name: 'Anel do Selo Imperial', description: 'Insígnia de um império morto que ainda comanda obediência.',
    type: 'RING', level: 26, rarity: 'EPIC', goldPrice: 3600, source: 'dungeon_boss', dungeons: ['ruinas'],
    stats: { str: 5, int: 5, agi: 5, def: 5, specialEffect: 'Bônus em todos os atributos' },
  },

  // --- COLARES (1 por masmorra) ---
  {
    name: 'Amuleto da Coruja', description: 'Olho de âmbar que enxerga a fraqueza do inimigo na escuridão.',
    type: 'NECKLACE', level: 7, rarity: 'RARE', goldPrice: 950, source: 'dungeon', dungeons: ['floresta'],
    stats: { agi: 6, bonusSpeed: 6, specialEffect: 'Aumenta a chance de crítico' },
  },
  {
    name: 'Colar do Veio Dourado', description: 'Pepita bruta do coração da caverna; atrai a fortuna.',
    type: 'NECKLACE', level: 12, rarity: 'RARE', goldPrice: 1500, source: 'dungeon', dungeons: ['caverna'],
    stats: { def: 4, hp: 20, specialEffect: 'Aumenta GOLD e XP encontrados' },
  },
  {
    name: 'Talismã do Fogo-Fátuo', description: 'Aprisiona uma chama-fantasma do pântano que devolve energia.',
    type: 'NECKLACE', level: 18, rarity: 'EPIC', goldPrice: 3000, source: 'dungeon_boss', dungeons: ['pantano'],
    stats: { int: 8, mp: 40, specialEffect: 'Restaura mana e stamina ao derrotar inimigos' },
  },
  {
    name: 'Relicário do Lich', description: 'Guarda um fragmento da alma imortal do Imperador morto.',
    type: 'NECKLACE', level: 26, rarity: 'EPIC', goldPrice: 3800, source: 'dungeon_boss', dungeons: ['ruinas'],
    stats: { int: 7, hp: 40, mp: 40, specialEffect: 'Regeneração acelerada de HP/MP' },
  },

  // ============================================================
  // 🗓️ AVENTURAS SEMANAIS — CHEFES ÚNICOS (gear nomeado, Lendário)
  //   1 chefe por sábado (semana 1–4 do mês). Drop exclusivo do chefe.
  // ============================================================

  // 🔥 Sábado 1 — Krax-thar, o Devorador de Mundos (dragão ígneo)
  {
    name: 'Lâmina de Krax-thar', description: 'Forjada na garganta do Devorador. Arde com a fome de um mundo.',
    type: 'SWORD', level: 35, rarity: 'LEGENDARY', goldPrice: 16000, source: 'adventure_boss', adventureBoss: 'Krax-thar', dungeons: [],
    stats: { str: 12, bonusDamage: 42, bonusSpeed: 4, specialEffect: 'Dano de fogo massivo; queima o alvo por turnos' },
  },
  {
    name: 'Coração de Krax-thar', description: 'O coração ainda pulsante do dragão; quanto mais ferido você está, mais ele queima.',
    type: 'NECKLACE', level: 35, rarity: 'LEGENDARY', goldPrice: 15000, source: 'adventure_boss', adventureBoss: 'Krax-thar', dungeons: [],
    stats: { str: 8, hp: 70, def: 6, specialEffect: 'Aumenta o dano conforme o HP perdido' },
  },

  // 🕷️ Sábado 2 — Vol'theris, a Tecelã do Vazio
  {
    name: "Presas de Vol'theris", description: 'Adagas-presa que mordem entre os planos, ignorando armaduras.',
    type: 'DAGGER', level: 35, rarity: 'LEGENDARY', goldPrice: 16000, source: 'adventure_boss', adventureBoss: "Vol'theris", dungeons: [],
    stats: { agi: 14, int: 6, bonusDamage: 40, bonusSpeed: 16, specialEffect: 'Ataques ignoram defesa; chance de reposicionar' },
  },
  {
    name: "Manto de Vol'theris", description: 'Tecido com fios do vazio; por instantes, você simplesmente não está lá.',
    type: 'LIGHT_ARMOR', level: 35, rarity: 'LEGENDARY', goldPrice: 15500, source: 'adventure_boss', adventureBoss: "Vol'theris", dungeons: [],
    stats: { def: 11, agi: 10, int: 10, mp: 55, bonusSpeed: 12, specialEffect: 'Chance de anular completamente um golpe' },
  },

  // 🗿 Sábado 3 — Gorthak, o Colosso de Adamantite
  {
    name: 'Esmagador de Gorthak', description: 'Machado-martelo de adamantite bruta. O chão treme onde ele cai.',
    type: 'AXE', level: 35, rarity: 'LEGENDARY', goldPrice: 16500, source: 'adventure_boss', adventureBoss: 'Gorthak', dungeons: [],
    stats: { str: 15, def: 6, bonusDamage: 44, specialEffect: 'Ignora parte da defesa; atordoa em crítico' },
  },
  {
    name: 'Égide de Gorthak', description: 'Forjada do núcleo do Colosso; praticamente indestrutível.',
    type: 'HEAVY_ARMOR', level: 35, rarity: 'LEGENDARY', goldPrice: 16000, source: 'adventure_boss', adventureBoss: 'Gorthak', dungeons: [],
    stats: { def: 20, hp: 90, bonusDefense: 30, specialEffect: 'Reflete parte do dano físico recebido' },
  },

  // ✨ Sábado 4 — Sylariel, a Rainha Celeste (elfa caída)
  {
    name: 'Arco de Sylariel', description: 'Dispara flechas de luz pura que perfuram a noite e a carne.',
    type: 'BOW', level: 35, rarity: 'LEGENDARY', goldPrice: 16000, source: 'adventure_boss', adventureBoss: 'Sylariel', dungeons: [],
    stats: { agi: 15, int: 8, bonusDamage: 42, bonusSpeed: 12, specialEffect: 'Flechas perfurantes; crítico aumentado' },
  },
  {
    name: 'Cajado de Sylariel', description: 'Cetro da Rainha Celeste; cada feitiço devolve um sopro de vida.',
    type: 'STAFF', level: 35, rarity: 'LEGENDARY', goldPrice: 16500, source: 'adventure_boss', adventureBoss: 'Sylariel', dungeons: [],
    stats: { int: 18, mp: 70, bonusDamage: 30, specialEffect: 'Magias custam menos mana e curam o conjurador' },
  },
  {
    name: 'Lágrima de Sylariel', description: 'Uma única lágrima cristalizada da Rainha, fria e radiante.',
    type: 'RING', level: 35, rarity: 'LEGENDARY', goldPrice: 15000, source: 'adventure_boss', adventureBoss: 'Sylariel', dungeons: [],
    stats: { int: 8, agi: 6, mp: 50, specialEffect: 'Aumenta poder mágico e chance de crítico' },
  },
];

// === CATÁLOGO DE CONSUMÍVEIS ===
// Loja: básicos/intermediários (espelham seed-battle-consumables.ts).
// Masmorras/Aventuras: aprimorados e únicos (drop de chefe).

export interface ConsumableItem {
  name: string;
  description: string;
  /** ConsumableSubtype do Prisma (string). */
  subtype: string;
  level: number;
  rarity: Rarity;
  goldPrice: number;
  source: ItemSource;
  stats: Record<string, any>;
  /** (aventura) chefe semanal que dropa o consumível único. */
  adventureBoss?: string;
}

export const CONSUMABLE_CATALOG: ConsumableItem[] = [
  // ---------- 🏪 LOJA — básicos e intermediários ----------
  {
    name: 'Poção de Vida Pequena', description: 'Restaura 30 HP instantaneamente em combate.',
    subtype: 'HEALTH_POTION', level: 1, rarity: 'COMMON', goldPrice: 50, source: 'shop',
    stats: { healAmount: 30, effect: 'instant', battleUsable: true },
  },
  {
    name: 'Poção de Vida', description: 'Restaura 50 HP instantaneamente em combate.',
    subtype: 'HEALTH_POTION', level: 2, rarity: 'COMMON', goldPrice: 100, source: 'shop',
    stats: { healAmount: 50, effect: 'instant', battleUsable: true },
  },
  {
    name: 'Poção de Mana', description: 'Restaura 30 MP instantaneamente em combate.',
    subtype: 'MANA_POTION', level: 1, rarity: 'COMMON', goldPrice: 75, source: 'shop',
    stats: { manaAmount: 30, effect: 'instant', battleUsable: true },
  },
  {
    name: 'Poção de Stamina', description: 'Restaura 20 de stamina instantaneamente.',
    subtype: 'STAMINA_POTION', level: 1, rarity: 'COMMON', goldPrice: 80, source: 'shop',
    stats: { staminaAmount: 20, effect: 'instant', battleUsable: true },
  },
  {
    name: 'Elixir Menor', description: 'Restaura 25 HP e 20 MP em combate.',
    subtype: 'ELIXIR', level: 1, rarity: 'UNCOMMON', goldPrice: 120, source: 'shop',
    stats: { healAmount: 25, manaAmount: 20, effect: 'instant', battleUsable: true },
  },
  {
    name: 'Poção de Força', description: 'Aumenta o ataque em 5 por 3 turnos.',
    subtype: 'STRENGTH_BUFF', level: 2, rarity: 'UNCOMMON', goldPrice: 180, source: 'shop',
    stats: { attackBonus: 5, duration: 3, effect: 'temporary', battleUsable: true },
  },
  {
    name: 'Poção de Defesa', description: 'Aumenta a defesa em 3 por 3 turnos.',
    subtype: 'DEFENSE_BUFF', level: 2, rarity: 'UNCOMMON', goldPrice: 160, source: 'shop',
    stats: { defenseBonus: 3, duration: 3, effect: 'temporary', battleUsable: true },
  },
  {
    name: 'Poção de Agilidade', description: 'Aumenta a esquiva em 15% por 3 turnos.',
    subtype: 'AGILITY_BUFF', level: 2, rarity: 'UNCOMMON', goldPrice: 170, source: 'shop',
    stats: { dodgeBonus: 15, duration: 3, effect: 'temporary', battleUsable: true },
  },
  {
    name: 'Antídoto', description: 'Remove venenos e toxinas comuns.',
    subtype: 'ANTIDOTE', level: 2, rarity: 'COMMON', goldPrice: 60, source: 'shop',
    stats: { cure: 'poison', effect: 'instant', battleUsable: true },
  },

  // ---------- 🗝️ MASMORRAS — aprimorados ----------
  {
    name: 'Poção de Vida Grande', description: 'Restaura 80 HP instantaneamente em combate.',
    subtype: 'HEALTH_POTION', level: 5, rarity: 'RARE', goldPrice: 220, source: 'dungeon',
    stats: { healAmount: 80, effect: 'instant', battleUsable: true },
  },
  {
    name: 'Poção de Cura Suprema', description: 'Restaura 150 HP instantaneamente. Rara nas profundezas.',
    subtype: 'HEALTH_POTION', level: 12, rarity: 'EPIC', goldPrice: 500, source: 'dungeon_boss',
    stats: { healAmount: 150, effect: 'instant', battleUsable: true },
  },
  {
    name: 'Elixir Supremo', description: 'Restaura 60 HP e 50 MP em combate.',
    subtype: 'ELIXIR', level: 8, rarity: 'RARE', goldPrice: 400, source: 'dungeon',
    stats: { healAmount: 60, manaAmount: 50, effect: 'instant', battleUsable: true },
  },
  {
    name: 'Tônico do Berserker', description: 'Aumenta o ataque em 12 por 4 turnos. Destilado de sangue de monstro.',
    subtype: 'STRENGTH_BUFF', level: 10, rarity: 'RARE', goldPrice: 420, source: 'dungeon',
    stats: { attackBonus: 12, duration: 4, effect: 'temporary', battleUsable: true },
  },
  {
    name: 'Pó de Fênix', description: 'Revive um personagem caído com 50% do HP máximo.',
    subtype: 'REVIVE_POTION', level: 12, rarity: 'EPIC', goldPrice: 1200, source: 'dungeon_boss',
    stats: { reviveHpPercent: 50, effect: 'revive', battleUsable: false },
  },

  // ---------- 🗓️ AVENTURAS — únicos (drop de chefe semanal) ----------
  {
    name: 'Sangue de Dragão', description: 'Cura todo o HP e envolve a arma em fogo por vários turnos.',
    subtype: 'ELIXIR', level: 35, rarity: 'LEGENDARY', goldPrice: 3000, source: 'adventure_boss', adventureBoss: 'Krax-thar',
    stats: { healAmount: 9999, attackBonus: 15, duration: 4, effect: 'instant', battleUsable: true },
  },
  {
    name: 'Essência do Vazio', description: 'Restaura toda a mana; chance de fazer o inimigo perder o próximo turno.',
    subtype: 'ELIXIR', level: 35, rarity: 'LEGENDARY', goldPrice: 3000, source: 'adventure_boss', adventureBoss: "Vol'theris",
    stats: { manaAmount: 9999, effect: 'instant', battleUsable: true, special: 'skipEnemyTurn' },
  },
  {
    name: 'Núcleo de Adamantite', description: 'Concede um escudo que absorve uma grande quantidade de dano.',
    subtype: 'DEFENSE_BUFF', level: 35, rarity: 'LEGENDARY', goldPrice: 3000, source: 'adventure_boss', adventureBoss: 'Gorthak',
    stats: { shieldAmount: 200, duration: 5, effect: 'temporary', battleUsable: true },
  },
  {
    name: 'Lágrima Celeste', description: 'Revive com 100% do HP e concede crítico garantido no próximo golpe.',
    subtype: 'REVIVE_POTION', level: 35, rarity: 'LEGENDARY', goldPrice: 3500, source: 'adventure_boss', adventureBoss: 'Sylariel',
    stats: { reviveHpPercent: 100, effect: 'revive', battleUsable: true, special: 'guaranteedCrit' },
  },
];

// === ÍNDICES E HELPERS ===

const BY_NAME = new Map(ITEM_CATALOG.map((i) => [i.name, i]));

export function getCatalogItemByName(name: string): CatalogItem | undefined {
  return BY_NAME.get(name);
}

export function getItemsForDungeon(dungeonId: string): CatalogItem[] {
  return ITEM_CATALOG.filter((i) => i.dungeons.includes(dungeonId));
}

export function getItemsByRarity(rarity: Rarity): CatalogItem[] {
  return ITEM_CATALOG.filter((i) => i.rarity === rarity);
}

/** Itens vendidos na loja (NPC). Opcionalmente filtrados pela raça do personagem ativo. */
export function getShopItems(race?: string | null): CatalogItem[] {
  const shop = ITEM_CATALOG.filter((i) => i.source === 'shop');
  if (!race) return shop;
  return shop.filter((i) => canRaceEquip(race, i.type, i.raceRestriction).ok);
}

/** Drops de uma masmorra (não inclui itens de loja, que têm dungeons vazio). */
export function getDungeonDrops(dungeonId: string): CatalogItem[] {
  return getItemsForDungeon(dungeonId);
}

/** Itens dropados por um chefe de aventura semanal. */
export function getAdventureBossDrops(bossName: string): CatalogItem[] {
  return ITEM_CATALOG.filter((i) => i.adventureBoss === bossName);
}

// Pesos relativos de drop por raridade (quanto maior, mais comum).
export const RARITY_DROP_WEIGHT: Record<Rarity, number> = {
  COMMON: 100,
  UNCOMMON: 45,
  RARE: 18,
  EPIC: 5,
  LEGENDARY: 1,
};

// Restrições de peso de armadura por raça (texto em characterCreationData).
// 'LIGHT' = peças leves; 'HEAVY' = peças pesadas.
const RACE_FORBIDDEN_WEIGHT: Record<RaceId, 'LIGHT' | 'HEAVY' | null> = {
  draconiano: 'LIGHT', // "Não pode usar armaduras leves"
  metamorfo: 'HEAVY',  // "Não pode usar armaduras pesadas"
  elfo: 'HEAVY',       // "Não pode usar armaduras pesadas"
  humano: null,
};

function armorWeightOf(type: ItemTypeStr): 'LIGHT' | 'MEDIUM' | 'HEAVY' | null {
  if (type.startsWith('LIGHT_')) return 'LIGHT';
  if (type.startsWith('MEDIUM_')) return 'MEDIUM';
  if (type.startsWith('HEAVY_')) return 'HEAVY';
  return null;
}

const RACE_LABEL: Record<RaceId, string> = {
  draconiano: 'Draconiano',
  metamorfo: 'Metamorfo',
  humano: 'Humano',
  elfo: 'Elfo',
};

function isRaceId(v: string): v is RaceId {
  return v === 'draconiano' || v === 'metamorfo' || v === 'humano' || v === 'elfo';
}

/**
 * Verifica se uma raça pode equipar um item.
 * Considera tanto a exclusividade do item (raceRestriction) quanto a
 * restrição de peso de armadura da raça.
 */
export function canRaceEquip(
  race: string | null | undefined,
  itemType: ItemTypeStr,
  raceRestriction?: RaceId | null,
): { ok: boolean; reason?: string } {
  const r = (race || '').toLowerCase();

  // 1. Item exclusivo de raça
  if (raceRestriction && r !== raceRestriction) {
    return { ok: false, reason: `Item exclusivo da raça ${RACE_LABEL[raceRestriction]}.` };
  }

  // 2. Restrição de peso de armadura
  if (isRaceId(r)) {
    const forbidden = RACE_FORBIDDEN_WEIGHT[r];
    const weight = armorWeightOf(itemType);
    if (forbidden && weight === forbidden) {
      const label = forbidden === 'LIGHT' ? 'leves' : 'pesadas';
      return { ok: false, reason: `${RACE_LABEL[r]} não pode usar armaduras ${label}.` };
    }
  }

  return { ok: true };
}

/**
 * Sorteia um item de uma masmorra, respeitando:
 *  - nível do personagem (item.level <= level + folga)
 *  - raça (itens exclusivos só caem para a raça certa)
 *  - origem: ÉPICO e LENDÁRIO (source dungeon_boss) só caem de chefe
 *  - pesos de raridade
 * Retorna null se nenhum item elegível.
 */
export function rollDungeonDrop(
  dungeonId: string,
  characterLevel: number,
  race?: string | null,
  fromBoss = false,
  rng: () => number = Math.random,
): CatalogItem | null {
  const r = (race || '').toLowerCase();
  const levelCap = characterLevel + 3; // pequena folga para itens um pouco acima

  const eligible = getItemsForDungeon(dungeonId).filter((item) => {
    if (item.level > levelCap) return false;
    if (item.raceRestriction && item.raceRestriction !== r) return false;
    // Itens exclusivos de chefe só caem quando o chefe é derrotado.
    if (item.source === 'dungeon_boss' && !fromBoss) return false;
    return true;
  });

  if (eligible.length === 0) return null;

  const totalWeight = eligible.reduce((sum, i) => sum + RARITY_DROP_WEIGHT[i.rarity], 0);
  let pick = rng() * totalWeight;
  for (const item of eligible) {
    pick -= RARITY_DROP_WEIGHT[item.rarity];
    if (pick < 0) return item;
  }
  return eligible[eligible.length - 1];
}
