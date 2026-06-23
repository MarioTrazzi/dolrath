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
  | 'RING' | 'NECKLACE' | 'SHIELD'
  | 'GAUNTLET' | 'ORB' | 'BELT';

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
    stats: { str: 9 },
  },
  {
    name: 'Adaga Ligeira', description: 'Leve e afiada, premia reflexos rápidos e golpes em sequência.',
    type: 'DAGGER', level: 1, rarity: 'COMMON', goldPrice: 95, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 11 },
  },
  {
    name: 'Cajado de Aprendiz', description: 'Madeira tratada que conduz as primeiras faíscas arcanas.',
    type: 'STAFF', level: 1, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'arcane', dungeons: [],
    stats: { int: 6, mp: 10 },
  },
  {
    name: 'Machado do Guarda', description: 'Pesado e estável; troca velocidade por impacto e firmeza.',
    type: 'AXE', level: 2, rarity: 'COMMON', goldPrice: 120, source: 'shop', build: 'guardian', dungeons: [],
    stats: { str: 7, def: 2, hp: 8 },
  },

  // ---------- SUPERIOR (UNCOMMON, nível 5–11) ----------
  {
    name: 'Espada do Veterano', description: 'Aço temperado de quem já viu batalhas. Corte limpo e poderoso.',
    type: 'SWORD', level: 6, rarity: 'UNCOMMON', goldPrice: 420, source: 'shop', build: 'brute', dungeons: [],
    stats: { str: 16 },
  },
  {
    name: 'Arco do Batedor', description: 'Arco composto para o combatente ágil que prefere a distância.',
    type: 'BOW', level: 6, rarity: 'UNCOMMON', goldPrice: 410, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 20 },
  },
  {
    name: 'Cajado Rúnico', description: 'Runas gravadas amplificam o fluxo de mana do conjurador.',
    type: 'STAFF', level: 7, rarity: 'UNCOMMON', goldPrice: 450, source: 'shop', build: 'arcane', dungeons: [],
    stats: { int: 13, mp: 18 },
  },
  {
    name: 'Machado de Guerra', description: 'Cabeça maciça que esmaga defesas. Para quem segura a linha de frente.',
    type: 'AXE', level: 8, rarity: 'UNCOMMON', goldPrice: 480, source: 'shop', build: 'guardian', dungeons: [],
    stats: { str: 13, def: 3, hp: 16 },
  },
  {
    name: 'Arco Curto', description: 'Arco simples de madeira flexível; o primeiro passo do batedor.',
    type: 'BOW', level: 2, rarity: 'COMMON', goldPrice: 100, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 9 },
  },
  {
    name: 'Punhal do Caçador', description: 'Lâmina curva e leve; perfeita para golpes rápidos em sequência.',
    type: 'DAGGER', level: 6, rarity: 'UNCOMMON', goldPrice: 420, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 18 },
  },

  // ============================================================
  // 🏪 LOJA — ARMADURA DE CORPO (4 variantes por tier)
  //   Peso da peça define quais raças podem equipar (canRaceEquip).
  // ============================================================

  // ---------- COMUM (nível 1–4) ----------
  {
    name: 'Gibão de Couro', description: 'Leve e flexível; prioriza mobilidade e esquiva.',
    type: 'LIGHT_ARMOR', level: 1, rarity: 'COMMON', goldPrice: 130, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 7, def: 3, hp: 8 },
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
    stats: { def: 12, hp: 18 },
  },

  // ---------- SUPERIOR (UNCOMMON, nível 5–11) ----------
  {
    name: 'Armadura de Couro Batido', description: 'Couro endurecido em camadas; ágil sem abrir mão da proteção.',
    type: 'LIGHT_ARMOR', level: 6, rarity: 'UNCOMMON', goldPrice: 480, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 12, def: 6, hp: 18 },
  },
  {
    name: 'Vestes do Conjurador', description: 'Bordadas com fios de prata que canalizam mana.',
    type: 'LIGHT_ARMOR', level: 7, rarity: 'UNCOMMON', goldPrice: 460, source: 'shop', build: 'arcane', dungeons: [],
    stats: { int: 5, def: 8, mp: 22 },
  },
  {
    name: 'Brigantina Reforçada', description: 'Placas rebitadas em couro; o meio-termo versátil para todos.',
    type: 'MEDIUM_ARMOR', level: 8, rarity: 'UNCOMMON', goldPrice: 560, source: 'shop', build: 'guardian', dungeons: [],
    stats: { agi: 2, def: 16, hp: 25 },
  },
  {
    name: 'Couraça de Aço', description: 'Armadura completa de placas. Muralha ambulante.',
    type: 'HEAVY_ARMOR', level: 10, rarity: 'UNCOMMON', goldPrice: 680, source: 'shop', build: 'guardian', dungeons: [],
    stats: { str: 2, def: 23, hp: 35 },
  },

  // ============================================================
  // 🏪 LOJA — EQUIPAMENTO DE APOIO (elmo/luvas/botas/escudo, leve+pesado)
  //   Completa o conjunto da cabeça aos pés. Escudo é universal.
  // ============================================================

  // ---------- COMUM ----------
  {
    name: 'Capuz de Couro', description: 'Cobertura leve para a cabeça, sem atrapalhar a visão.',
    type: 'LIGHT_HELMET', level: 1, rarity: 'COMMON', goldPrice: 70, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 3, def: 2 },
  },
  {
    name: 'Elmo de Ferro', description: 'Casco metálico que absorve impactos na cabeça.',
    type: 'HEAVY_HELMET', level: 2, rarity: 'COMMON', goldPrice: 95, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 8, hp: 8 },
  },
  {
    name: 'Luvas de Couro', description: 'Boa pegada e proteção básica para as mãos.',
    type: 'LIGHT_GLOVES', level: 1, rarity: 'COMMON', goldPrice: 65, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 5, def: 1 },
  },
  {
    name: 'Manoplas de Ferro', description: 'Mãos blindadas para quem dá e recebe golpes pesados.',
    type: 'HEAVY_GLOVES', level: 2, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'guardian', dungeons: [],
    stats: { str: 4, def: 3 },
  },
  {
    name: 'Botas de Viajante', description: 'Solado firme para longas caminhadas e fugas rápidas.',
    type: 'LIGHT_BOOTS', level: 1, rarity: 'COMMON', goldPrice: 65, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 6, def: 1 },
  },
  {
    name: 'Botas de Placa', description: 'Pesadas, mas mantêm o portador firme no chão.',
    type: 'HEAVY_BOOTS', level: 2, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 6, hp: 8 },
  },
  {
    name: 'Escudo de Madeira', description: 'Tábuas reforçadas que aparam os primeiros golpes.',
    type: 'SHIELD', level: 1, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 6 },
  },

  // ---------- SUPERIOR (UNCOMMON) ----------
  {
    name: 'Coif de Malha', description: 'Capuz de anéis entrelaçados; leve proteção sem perder agilidade.',
    type: 'LIGHT_HELMET', level: 6, rarity: 'UNCOMMON', goldPrice: 300, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 7, def: 4, mp: 6 },
  },
  {
    name: 'Elmo do Sentinela', description: 'Visor reforçado que protege rosto e pescoço.',
    type: 'HEAVY_HELMET', level: 8, rarity: 'UNCOMMON', goldPrice: 380, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 15, hp: 18 },
  },
  {
    name: 'Luvas de Malha', description: 'Articuladas e leves, ideais para empunhar qualquer arma.',
    type: 'LIGHT_GLOVES', level: 6, rarity: 'UNCOMMON', goldPrice: 290, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 9, def: 3 },
  },
  {
    name: 'Manoplas do Sentinela', description: 'Placas articuladas que somam soco e bloqueio.',
    type: 'HEAVY_GLOVES', level: 8, rarity: 'UNCOMMON', goldPrice: 360, source: 'shop', build: 'guardian', dungeons: [],
    stats: { str: 9, def: 5 },
  },
  {
    name: 'Botas de Malha', description: 'Passos silenciosos e protegidos.',
    type: 'LIGHT_BOOTS', level: 6, rarity: 'UNCOMMON', goldPrice: 290, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 12, def: 3 },
  },
  {
    name: 'Grevas de Aço', description: 'Pernas blindadas que reduzem quedas e empurrões.',
    type: 'HEAVY_BOOTS', level: 8, rarity: 'UNCOMMON', goldPrice: 360, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 12, hp: 16 },
  },
  {
    name: 'Escudo de Ferro', description: 'Disco de ferro batido, resistente a golpes pesados.',
    type: 'SHIELD', level: 5, rarity: 'UNCOMMON', goldPrice: 350, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 12 },
  },

  // ============================================================
  // 🏪 LOJA — ARMA DO MONGE (manoplas) e OFFHAND DO MAGO (orbe)
  //   GAUNTLET vai no slot de arma; ORB vai no slot de secundária.
  // ============================================================
  {
    name: 'Manoplas do Discípulo', description: 'Couro envolto em ferro nos nós dos dedos; o primeiro passo da via marcial.',
    type: 'GAUNTLET', level: 1, rarity: 'COMMON', goldPrice: 100, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 9, hp: 4 },
  },
  {
    name: 'Punhos de Aço', description: 'Cestus reforçado com placas; cada golpe carrega o peso do aço.',
    type: 'GAUNTLET', level: 6, rarity: 'UNCOMMON', goldPrice: 430, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 17, hp: 8 },
  },
  {
    name: 'Orbe de Cristal', description: 'Esfera de quartzo que flutua na mão livre do conjurador, ampliando o foco.',
    type: 'ORB', level: 1, rarity: 'COMMON', goldPrice: 95, source: 'shop', build: 'arcane', dungeons: [],
    stats: { int: 4, mp: 8 },
  },
  {
    name: 'Orbe Rúnico', description: 'Cristais menores orbitam o núcleo, sussurrando fórmulas arcanas.',
    type: 'ORB', level: 7, rarity: 'UNCOMMON', goldPrice: 450, source: 'shop', build: 'arcane', dungeons: [],
    stats: { int: 7, mp: 16 },
  },

  // ============================================================
  // 🏪 LOJA — CINTOS (slot novo; 4 builds + superiores)
  // ============================================================
  {
    name: 'Cinturão de Couro', description: 'Tira larga de couro com fivela de ferro; firma a postura na linha de frente.',
    type: 'BELT', level: 1, rarity: 'COMMON', goldPrice: 85, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 3, hp: 10 },
  },
  {
    name: 'Faixa Ágil', description: 'Tecido leve amarrado na cintura, sem atrapalhar o movimento.',
    type: 'BELT', level: 1, rarity: 'COMMON', goldPrice: 80, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 3, hp: 6 },
  },
  {
    name: 'Cinta de Mana', description: 'Bolsos costurados com fios prateados que estabilizam o fluxo arcano.',
    type: 'BELT', level: 1, rarity: 'COMMON', goldPrice: 80, source: 'shop', build: 'arcane', dungeons: [],
    stats: { int: 3, mp: 12 },
  },
  {
    name: 'Cinturão de Força', description: 'Pesado e largo; distribui o esforço dos golpes mais brutais.',
    type: 'BELT', level: 2, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'brute', dungeons: [],
    stats: { str: 3, hp: 8 },
  },
  {
    name: 'Cinturão Reforçado', description: 'Placas rebitadas sobre couro grosso; uma muralha na cintura.',
    type: 'BELT', level: 7, rarity: 'UNCOMMON', goldPrice: 360, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 6, hp: 22 },
  },
  {
    name: 'Faixa do Conjurador', description: 'Runas bordadas guardam reservas extras de mana para o feiticeiro.',
    type: 'BELT', level: 7, rarity: 'UNCOMMON', goldPrice: 350, source: 'shop', build: 'arcane', dungeons: [],
    stats: { int: 6, mp: 22 },
  },

  // ============================================================
  // 🏪 LOJA — ANÉIS (acessório básico; 4 builds + superiores). Base comum/incomum
  //   que também alimenta o espólio de masmorra (drop por elegibilidade).
  // ============================================================
  {
    name: 'Anel de Cobre', description: 'Aro simples de cobre batido; firma o punho do lutador iniciante.',
    type: 'RING', level: 1, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'brute', dungeons: [],
    stats: { str: 4, hp: 6 },
  },
  {
    name: 'Anel do Batedor', description: 'Aro leve e sem peso, não atrapalha o saque rápido da lâmina.',
    type: 'RING', level: 1, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 4, hp: 4 },
  },
  {
    name: 'Anel de Quartzo', description: 'Pedra bruta que guarda uma fagulha de mana para o aprendiz.',
    type: 'RING', level: 1, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'arcane', dungeons: [],
    stats: { int: 4, mp: 8 },
  },
  {
    name: 'Anel do Sentinela', description: 'Ferro grosso e sólido que reforça a guarda na linha de frente.',
    type: 'RING', level: 2, rarity: 'COMMON', goldPrice: 95, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 3, hp: 6 },
  },
  {
    name: 'Anel do Duelista', description: 'Gema afiada lapidada em pontas; premia reflexos e contra-ataques.',
    type: 'RING', level: 7, rarity: 'UNCOMMON', goldPrice: 360, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 9, hp: 8 },
  },
  {
    name: 'Anel do Brutamontes', description: 'Aro maciço de aço fundido que concentra a força bruta em cada golpe.',
    type: 'RING', level: 7, rarity: 'UNCOMMON', goldPrice: 360, source: 'shop', build: 'brute', dungeons: [],
    stats: { str: 9, hp: 10 },
  },

  // ============================================================
  // 🏪 LOJA — COLARES (acessório básico; 4 builds + superiores). Mesma ideia dos
  //   anéis: base comum/incomum que também cai como espólio de masmorra.
  // ============================================================
  {
    name: 'Colar de Osso', description: 'Dente de fera num cordão de couro; talismã dos destemidos.',
    type: 'NECKLACE', level: 1, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'brute', dungeons: [],
    stats: { str: 3, hp: 10 },
  },
  {
    name: 'Colar do Viajante', description: 'Pingente leve de estanho que acompanha o passo ágil pela estrada.',
    type: 'NECKLACE', level: 1, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'agile', dungeons: [],
    stats: { agi: 3, hp: 8 },
  },
  {
    name: 'Pingente de Cristal', description: 'Lasca cristalina translúcida que conserva um eco de mana.',
    type: 'NECKLACE', level: 1, rarity: 'COMMON', goldPrice: 90, source: 'shop', build: 'arcane', dungeons: [],
    stats: { int: 3, mp: 10 },
  },
  {
    name: 'Amuleto de Ferro', description: 'Placa redonda de ferro gravada com um brasão simples de proteção.',
    type: 'NECKLACE', level: 2, rarity: 'COMMON', goldPrice: 95, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 3, hp: 8 },
  },
  {
    name: 'Gargantilha de Aço', description: 'Elos de aço temperado que blindam o pescoço exposto na batalha.',
    type: 'NECKLACE', level: 7, rarity: 'UNCOMMON', goldPrice: 360, source: 'shop', build: 'guardian', dungeons: [],
    stats: { def: 6, hp: 22 },
  },
  {
    name: 'Colar do Conjurador', description: 'Fios de prata trançados em torno de uma gema que amplia a reserva arcana.',
    type: 'NECKLACE', level: 7, rarity: 'UNCOMMON', goldPrice: 360, source: 'shop', build: 'arcane', dungeons: [],
    stats: { int: 6, mp: 22 },
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
    stats: { str: 23, specialEffect: 'Chance de causar dano de fogo' }, dungeons: ['caverna'],
  },
  {
    name: 'Couraça de Escamas Ígneas', description: 'Escamas sobrepostas que fervem ao toque inimigo.',
    type: 'HEAVY_ARMOR', level: 16, rarity: 'RARE', goldPrice: 1800, source: 'dungeon', raceRestriction: 'draconiano',
    stats: { str: 3, def: 20, hp: 35 }, dungeons: ['pantano'],
  },
  {
    name: 'Égide do Dragão Ancião', description: 'Couraça das escamas de um dragão milenar. Só um descendente suporta seu peso ardente.',
    type: 'HEAVY_ARMOR', level: 24, rarity: 'EPIC', goldPrice: 3400, source: 'dungeon_boss', raceRestriction: 'draconiano',
    stats: { str: 5, def: 26, hp: 55, specialEffect: 'Imunidade parcial a fogo' }, dungeons: ['pantano'],
  },
  {
    name: 'Presas do Cataclismo', description: 'Machado gêmeo feito das presas de um dragão. Pulsa com fúria ancestral.',
    type: 'AXE', level: 30, rarity: 'LEGENDARY', goldPrice: 9000, source: 'dungeon_boss', raceRestriction: 'draconiano',
    stats: { str: 51, agi: 3, specialEffect: 'Explosão ígnea massiva em crítico' }, dungeons: ['ruinas'],
  },

  // 🧝 ELFO — INT/AGI, arco/cajado, leve
  {
    name: 'Arco do Luar Élfico', description: 'Esculpido em madeira-luar; leve como uma folha, certeiro como o destino.',
    type: 'BOW', level: 12, rarity: 'RARE', goldPrice: 1400, source: 'dungeon', raceRestriction: 'elfo',
    stats: { agi: 14, int: 18 }, dungeons: ['floresta'],
  },
  {
    name: 'Vestes do Bosque Celeste', description: 'Folhagem encantada que respira mana junto ao portador.',
    type: 'LIGHT_ARMOR', level: 13, rarity: 'RARE', goldPrice: 1300, source: 'dungeon', raceRestriction: 'elfo',
    stats: { int: 6, def: 12, mp: 25, specialEffect: 'Regeneração de mana' }, dungeons: ['floresta'],
  },
  {
    name: 'Cajado da Aurora Arcana', description: 'Canaliza a luz das primeiras horas; magia mais barata e brilhante.',
    type: 'STAFF', level: 23, rarity: 'EPIC', goldPrice: 3600, source: 'dungeon_boss', raceRestriction: 'elfo',
    stats: { int: 39, mp: 55, specialEffect: 'Reduz drasticamente o custo de mana' }, dungeons: ['ruinas'],
  },
  {
    name: 'Manto da Forma Celestial', description: 'Tecido de luz astral que ergue o elfo à sua forma ascendida.',
    type: 'LIGHT_ARMOR', level: 29, rarity: 'LEGENDARY', goldPrice: 9500, source: 'dungeon_boss', raceRestriction: 'elfo',
    stats: { agi: 18, int: 12, def: 10, mp: 60, specialEffect: 'Aumenta poder mágico e esquiva' }, dungeons: ['ruinas'],
  },

  // 🐺 METAMORFO — AGI, garras/adaga, leve/médio
  {
    name: 'Garras do Predador', description: 'Garras que se fundem às mãos do metamorfo, afiadas como navalhas.',
    type: 'DAGGER', level: 13, rarity: 'RARE', goldPrice: 1500, source: 'dungeon', raceRestriction: 'metamorfo',
    stats: { str: 3, agi: 35 }, dungeons: ['caverna'],
  },
  {
    name: 'Pelagem Mutável', description: 'Tecido vivo que se adapta à forma e ao instinto do portador.',
    type: 'MEDIUM_ARMOR', level: 14, rarity: 'RARE', goldPrice: 1600, source: 'dungeon', raceRestriction: 'metamorfo',
    stats: { agi: 17, def: 7, hp: 28, specialEffect: 'Aumenta a esquiva' }, dungeons: ['pantano'],
  },
  {
    name: 'Manto da Fera Primal', description: 'Carrega o cheiro de mil caçadas; desperta o predador interior.',
    type: 'MEDIUM_ARMOR', level: 22, rarity: 'EPIC', goldPrice: 3400, source: 'dungeon_boss', raceRestriction: 'metamorfo',
    stats: { agi: 22, def: 9, hp: 35, specialEffect: 'Esquiva aprimorada' }, dungeons: ['caverna'],
  },
  {
    name: 'Garras do Caçador Lunar', description: 'Brilham sob a lua cheia; cada golpe encadeia o próximo.',
    type: 'DAGGER', level: 28, rarity: 'LEGENDARY', goldPrice: 9200, source: 'dungeon_boss', raceRestriction: 'metamorfo',
    stats: { str: 5, agi: 64, specialEffect: 'Golpes em sequência ignoram parte da defesa' }, dungeons: ['pantano'],
  },

  // ⚔️ HUMANO — versátil, qualquer peso/arma
  {
    name: 'Espada do Andarilho', description: 'Equilibrada para a versatilidade humana — boa em qualquer mão.',
    type: 'SWORD', level: 11, rarity: 'RARE', goldPrice: 1300, source: 'dungeon', raceRestriction: 'humano',
    stats: { str: 6, agi: 23 }, dungeons: ['floresta'],
  },
  {
    name: 'Brigantina do Mercenário', description: 'Proteção confiável de quem vive da espada por contrato.',
    type: 'MEDIUM_ARMOR', level: 12, rarity: 'RARE', goldPrice: 1350, source: 'dungeon', raceRestriction: 'humano',
    stats: { agi: 3, def: 18, hp: 25 }, dungeons: ['caverna'],
  },
  {
    name: 'Égide do Herói', description: 'Carrega a determinação inquebrável da humanidade.',
    type: 'HEAVY_ARMOR', level: 21, rarity: 'EPIC', goldPrice: 3200, source: 'dungeon_boss', raceRestriction: 'humano',
    stats: { str: 4, def: 24, hp: 45, specialEffect: 'Reduz dano físico' }, dungeons: ['pantano'],
  },
  {
    name: 'Lâmina do Sétimo Sentido', description: 'Desperta com o portador; corta onde a mente prevê o golpe.',
    type: 'SWORD', level: 28, rarity: 'LEGENDARY', goldPrice: 9500, source: 'dungeon_boss', raceRestriction: 'humano',
    stats: { str: 10, agi: 14, int: 44, specialEffect: 'Ignora parte da defesa e concede XP extra' }, dungeons: ['ruinas'],
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
    stats: { int: 14, mp: 30 },
  },
  {
    name: 'Anel da Névoa Tóxica', description: 'Condensa os miasmas do Pântano Maldito num aro de osso.',
    type: 'RING', level: 18, rarity: 'EPIC', goldPrice: 2800, source: 'dungeon_boss', dungeons: ['pantano'],
    stats: { agi: 27 },
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
    stats: { agi: 12 },
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
  // 🗝️ MASMORRAS — MANOPLAS (Monge), ORBES (Mago) e CINTOS
  //   Sem restrição de raça (são por classe/build). Raro→Lendário.
  //   Épico/Lendário só de CHEFE.
  // ============================================================

  // --- MANOPLAS (arma do Monge) ---
  {
    name: 'Manoplas da Fera', description: 'Couro curtido com presas incrustadas; cada soco rosna como o predador que as forjou.',
    type: 'GAUNTLET', level: 13, rarity: 'RARE', goldPrice: 1450, source: 'dungeon', dungeons: ['caverna'],
    stats: { agi: 30, hp: 12 },
  },
  {
    name: 'Punhos do Mestre Marcial', description: 'Disciplina de mil treinos cristalizada em aço; a velocidade vira sequência.',
    type: 'GAUNTLET', level: 22, rarity: 'EPIC', goldPrice: 3300, source: 'dungeon_boss', dungeons: ['pantano'],
    stats: { agi: 40, hp: 18, specialEffect: 'Rajada de golpes em sequência' },
  },
  {
    name: 'Punhos do Dragão Interior', description: 'Despertam o cosmo do portador; o golpe atravessa carne e armadura.',
    type: 'GAUNTLET', level: 29, rarity: 'LEGENDARY', goldPrice: 9300, source: 'dungeon_boss', dungeons: ['ruinas'],
    stats: { str: 6, agi: 60, specialEffect: 'Golpes encadeados ignoram parte da defesa' },
  },

  // --- ORBES (offhand do Mago) ---
  {
    name: 'Orbe da Mata Espectral', description: 'Aprisiona a névoa luminosa da Floresta Sombria, que sussurra feitiços.',
    type: 'ORB', level: 12, rarity: 'RARE', goldPrice: 1350, source: 'dungeon', dungeons: ['floresta'],
    stats: { int: 22, mp: 28 },
  },
  {
    name: 'Orbe da Tempestade Arcana', description: 'Raios miniaturizados orbitam o núcleo, prontos para se espalhar pelo campo.',
    type: 'ORB', level: 22, rarity: 'EPIC', goldPrice: 3400, source: 'dungeon_boss', dungeons: ['pantano'],
    stats: { int: 40, mp: 45, specialEffect: 'Feitiços atingem em área' },
  },
  {
    name: 'Coração de Mana Eterno', description: 'Um cristal que pulsa como um coração vivo de pura energia arcana.',
    type: 'ORB', level: 29, rarity: 'LEGENDARY', goldPrice: 9400, source: 'dungeon_boss', dungeons: ['ruinas'],
    stats: { int: 58, mp: 65, specialEffect: 'Reduz o custo de mana e amplifica o dano mágico' },
  },

  // --- CINTOS (universais; 1 por masmorra) ---
  {
    name: 'Cinto da Mata Viva', description: 'Trançado de raízes que ainda respiram; firma o corpo e a vontade.',
    type: 'BELT', level: 7, rarity: 'RARE', goldPrice: 920, source: 'dungeon', dungeons: ['floresta'],
    stats: { def: 6, hp: 30, specialEffect: 'Regeneração lenta de HP' },
  },
  {
    name: 'Cinta de Cristal Pulsante', description: 'Cristais vivos costurados ao couro reabastecem a mana do portador.',
    type: 'BELT', level: 12, rarity: 'RARE', goldPrice: 1450, source: 'dungeon', dungeons: ['caverna'],
    stats: { int: 10, mp: 28 },
  },
  {
    name: 'Cinturão do Colosso', description: 'Placa central do tamanho de um escudo; carrega o peso de uma muralha.',
    type: 'BELT', level: 18, rarity: 'EPIC', goldPrice: 2900, source: 'dungeon_boss', dungeons: ['pantano'],
    stats: { str: 5, def: 20, hp: 48, specialEffect: 'Reduz o dano físico recebido' },
  },
  {
    name: 'Faixa do Destino', description: 'Tecida com fios de eras esquecidas; eleva tudo no portador.',
    type: 'BELT', level: 26, rarity: 'EPIC', goldPrice: 3700, source: 'dungeon_boss', dungeons: ['ruinas'],
    stats: { str: 5, agi: 5, int: 5, def: 8, hp: 35, specialEffect: 'Bônus em todos os atributos' },
  },

  // ============================================================
  // 🗝️ MASMORRAS — ARMAS QUE FALTAVAM POR RARIDADE
  //   Escudo (2ª do Guerreiro): Raro→Lendário · cajado Raro · épicos.
  // ============================================================

  // --- ESCUDOS (secundária do Guerreiro) — completam Raro/Épico/Lendário ---
  {
    name: 'Escudo do Guardião', description: 'Disco de aço maciço com o brasão de uma ordem esquecida.',
    type: 'SHIELD', level: 13, rarity: 'RARE', goldPrice: 1450, source: 'dungeon', dungeons: ['caverna'],
    stats: { def: 16, hp: 10 },
  },
  {
    name: 'Égide do Baluarte', description: 'Tão grande que vira uma parede; pouco a atravessa.',
    type: 'SHIELD', level: 22, rarity: 'EPIC', goldPrice: 3300, source: 'dungeon_boss', dungeons: ['pantano'],
    stats: { def: 24, hp: 22, specialEffect: 'Reduz o dano recebido por alguns turnos' },
  },
  {
    name: 'Muralha Viva', description: 'Metal rúnico que endurece ao receber o golpe e o devolve.',
    type: 'SHIELD', level: 29, rarity: 'LEGENDARY', goldPrice: 9300, source: 'dungeon_boss', dungeons: ['ruinas'],
    stats: { def: 34, hp: 32, specialEffect: 'Reflete parte do dano ao atacante' },
  },

  // --- CAJADO Raro (preenche o tier do Mago) ---
  {
    name: 'Cajado do Bosque Antigo', description: 'Galho da árvore-mãe que ainda conduz a seiva mágica da floresta.',
    type: 'STAFF', level: 12, rarity: 'RARE', goldPrice: 1350, source: 'dungeon', dungeons: ['floresta'],
    stats: { int: 24, mp: 28 },
  },

  // --- ARMAS ÉPICAS (preenchem o tier vazio) ---
  {
    name: 'Lâmina do Carrasco', description: 'Espada larga que pesa como uma sentença; busca o golpe final.',
    type: 'SWORD', level: 22, rarity: 'EPIC', goldPrice: 3400, source: 'dungeon_boss', dungeons: ['pantano'],
    stats: { str: 42, specialEffect: 'Dano extra contra alvos feridos' },
  },
  {
    name: 'Presas Gêmeas', description: 'Par de adagas curvas que mordem duas vezes a cada investida.',
    type: 'DAGGER', level: 22, rarity: 'EPIC', goldPrice: 3300, source: 'dungeon_boss', dungeons: ['caverna'],
    stats: { agi: 42, specialEffect: 'Chance de ataque duplo' },
  },
  {
    name: 'Arco da Tormenta', description: 'A corda zune como vento de tempestade; a flecha não conhece armadura.',
    type: 'BOW', level: 26, rarity: 'EPIC', goldPrice: 3500, source: 'dungeon_boss', dungeons: ['ruinas'],
    stats: { agi: 40, int: 6, specialEffect: 'Flecha perfurante ignora parte da defesa' },
  },

  // ============================================================
  // 🗓️ AVENTURAS SEMANAIS — CHEFES ÚNICOS (gear nomeado, Lendário)
  //   1 chefe por sábado (semana 1–4 do mês). Drop exclusivo do chefe.
  // ============================================================

  // 🔥 Sábado 1 — Krax-thar, o Devorador de Mundos (dragão ígneo)
  {
    name: 'Lâmina de Krax-thar', description: 'Forjada na garganta do Devorador. Arde com a fome de um mundo.',
    type: 'SWORD', level: 35, rarity: 'LEGENDARY', goldPrice: 16000, source: 'adventure_boss', adventureBoss: 'Krax-thar', dungeons: [],
    stats: { str: 54, agi: 4 },
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
    stats: { agi: 30, int: 46 },
  },
  {
    name: "Manto de Vol'theris", description: 'Tecido com fios do vazio; por instantes, você simplesmente não está lá.',
    type: 'LIGHT_ARMOR', level: 35, rarity: 'LEGENDARY', goldPrice: 15500, source: 'adventure_boss', adventureBoss: "Vol'theris", dungeons: [],
    stats: { agi: 22, int: 10, def: 11, mp: 55 },
  },

  // 🗿 Sábado 3 — Gorthak, o Colosso de Adamantite
  {
    name: 'Esmagador de Gorthak', description: 'Machado-martelo de adamantite bruta. O chão treme onde ele cai.',
    type: 'AXE', level: 35, rarity: 'LEGENDARY', goldPrice: 16500, source: 'adventure_boss', adventureBoss: 'Gorthak', dungeons: [],
    stats: { str: 59, def: 6 },
  },
  {
    name: 'Égide de Gorthak', description: 'Forjada do núcleo do Colosso; praticamente indestrutível.',
    type: 'HEAVY_ARMOR', level: 35, rarity: 'LEGENDARY', goldPrice: 16000, source: 'adventure_boss', adventureBoss: 'Gorthak', dungeons: [],
    stats: { def: 35, hp: 90 },
  },

  // ✨ Sábado 4 — Sylariel, a Rainha Celeste (elfa caída)
  {
    name: 'Arco de Sylariel', description: 'Dispara flechas de luz pura que perfuram a noite e a carne.',
    type: 'BOW', level: 35, rarity: 'LEGENDARY', goldPrice: 16000, source: 'adventure_boss', adventureBoss: 'Sylariel', dungeons: [],
    stats: { agi: 27, int: 50 },
  },
  {
    name: 'Cajado de Sylariel', description: 'Cetro da Rainha Celeste; cada feitiço devolve um sopro de vida.',
    type: 'STAFF', level: 35, rarity: 'LEGENDARY', goldPrice: 16500, source: 'adventure_boss', adventureBoss: 'Sylariel', dungeons: [],
    stats: { int: 48, mp: 70 },
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

// === CATÁLOGO DE INGREDIENTES DE ALQUIMIA ===
// Espólios de masmorra usados nas receitas de poção (src/lib/alchemy.ts).
// NÃO são vendidos na loja (source != 'shop') e NÃO são usáveis em combate
// (sem healAmount/manaAmount). No banco viram Item type=CONSUMABLE com
// stats.kind='ingredient', distinguindo-os das poções de verdade.

export interface AlchemyIngredient {
  name: string;
  description: string;
  emoji: string;
  rarity: Rarity;
  /** Valor de venda ao alquimista (gold). */
  goldValue: number;
  /** Onde cai: chão de masmorra (comum/incomum) ou só chefe (raro/épico). */
  source: 'dungeon' | 'dungeon_boss';
}

export const INGREDIENT_CATALOG: AlchemyIngredient[] = [
  // ---------- COMUM (chão de masmorra, inclusive a Floresta) ----------
  { name: 'Água Pura', description: 'Água de fonte límpida — solvente base de quase toda poção.', emoji: '💧', rarity: 'COMMON', goldValue: 6, source: 'dungeon' },
  { name: 'Erva Medicinal', description: 'Folhas cicatrizantes que fecham feridas e acalmam o corpo.', emoji: '🌿', rarity: 'COMMON', goldValue: 8, source: 'dungeon' },
  { name: 'Flor de Mana', description: 'Pétalas que guardam um resíduo de energia arcana.', emoji: '💠', rarity: 'COMMON', goldValue: 8, source: 'dungeon' },
  { name: 'Raiz Vigorosa', description: 'Raiz fibrosa que devolve fôlego e disposição.', emoji: '🌱', rarity: 'COMMON', goldValue: 8, source: 'dungeon' },
  { name: 'Cogumelo Lunar', description: 'Cresce só ao luar; base de toxinas e estimulantes.', emoji: '🍄', rarity: 'COMMON', goldValue: 10, source: 'dungeon' },

  // ---------- INCOMUM (chão de masmorra, sorte melhor) ----------
  { name: 'Seiva Ancestral', description: 'Resina de árvore milenar; concentra o poder curativo.', emoji: '🩸', rarity: 'UNCOMMON', goldValue: 22, source: 'dungeon' },
  { name: 'Pó de Osso', description: 'Osso de monstro moído, reforça músculos e couraça.', emoji: '🦴', rarity: 'UNCOMMON', goldValue: 20, source: 'dungeon' },
  { name: 'Cristal de Mana', description: 'Fragmento cristalino que amplifica efeitos mágicos.', emoji: '🔮', rarity: 'UNCOMMON', goldValue: 24, source: 'dungeon' },
  { name: 'Glândula de Veneno', description: 'Extraída de criaturas peçonhentas; isola e neutraliza toxinas.', emoji: '🟢', rarity: 'UNCOMMON', goldValue: 22, source: 'dungeon' },

  // ---------- RARO (só de chefe) ----------
  { name: 'Sangue de Monstro', description: 'Sangue fervente de feras; combustível da fúria berserker.', emoji: '🟥', rarity: 'RARE', goldValue: 60, source: 'dungeon_boss' },
  { name: 'Lótus Negra', description: 'Flor rara que só desabrocha em água apodrecida; potência suprema.', emoji: '🌸', rarity: 'RARE', goldValue: 65, source: 'dungeon_boss' },

  // ---------- ÉPICO (só de chefe) ----------
  { name: 'Pena de Fênix', description: 'Brasa viva que carrega a centelha da ressurreição.', emoji: '🪶', rarity: 'EPIC', goldValue: 160, source: 'dungeon_boss' },
  { name: 'Essência Cristalina', description: 'Essência destilada de núcleos arcanos; cura impossível.', emoji: '✨', rarity: 'EPIC', goldValue: 170, source: 'dungeon_boss' },
];

// === ÍNDICES E HELPERS ===

/** Slug estável do nome do item (sem acentos/apóstrofos) usado nos assets. */
export function itemImageSlug(name: string): string {
  return name
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // remove acentos
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Caminho do asset de imagem do item (webp gerado por scripts/generate-item-images.ts). */
export function itemImagePath(name: string): string {
  return `/items/${itemImageSlug(name)}.webp`;
}

const BY_NAME = new Map(ITEM_CATALOG.map((i) => [i.name, i]));

export function getCatalogItemByName(name: string): CatalogItem | undefined {
  return BY_NAME.get(name);
}

const CONSUMABLE_BY_NAME = new Map(CONSUMABLE_CATALOG.map((c) => [c.name, c]));

/** Consumível do catálogo pelo nome (para recompensas de exploração criarem o item real). */
export function getConsumableByName(name: string): ConsumableItem | undefined {
  return CONSUMABLE_BY_NAME.get(name);
}

/** Consumíveis que caem em masmorra (não os de loja). */
export function getDungeonConsumables(): ConsumableItem[] {
  return CONSUMABLE_CATALOG.filter((c) => c.source === 'dungeon' || c.source === 'dungeon_boss');
}

const INGREDIENT_BY_NAME = new Map(INGREDIENT_CATALOG.map((i) => [i.name, i]));

/** Ingrediente de alquimia pelo nome (para o loot e o craft resolverem o item). */
export function getIngredientByName(name: string): AlchemyIngredient | undefined {
  return INGREDIENT_BY_NAME.get(name);
}

/** Ingredientes de uma raridade (usado pelo sorteio de loot). */
export function getIngredientsByRarity(rarity: Rarity): AlchemyIngredient[] {
  return INGREDIENT_CATALOG.filter((i) => i.rarity === rarity);
}

export function getItemsForDungeon(dungeonId: string): CatalogItem[] {
  return ITEM_CATALOG.filter((i) => i.dungeons.includes(dungeonId));
}

export function getItemsByRarity(rarity: Rarity): CatalogItem[] {
  return ITEM_CATALOG.filter((i) => i.rarity === rarity);
}

/** Itens vendidos na loja (NPC). Filtra pelo que a raça+classe do personagem ativo pode equipar. */
export function getShopItems(race?: string | null, charClass?: string | null): CatalogItem[] {
  const shop = ITEM_CATALOG.filter((i) => i.source === 'shop');
  if (!race && !charClass) return shop;
  return shop.filter((i) => canEquip(race, charClass, i.type, i.raceRestriction).ok);
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

// 🎯 Restrições de equipamento por CLASSE (não por raça): peso de armadura e
// tipo de arma seguem a classe, como no BDO. A raça segue importando para
// stats, transformações e itens lendários EXCLUSIVOS (raceRestriction).
export type ClassId = 'warrior' | 'rogue' | 'mage' | 'monk';

// Pesos de armadura que cada classe pode vestir.
const CLASS_ALLOWED_WEIGHT: Record<ClassId, Array<'LIGHT' | 'MEDIUM' | 'HEAVY'>> = {
  warrior: ['MEDIUM', 'HEAVY'], // tanque/bruiser
  rogue:   ['LIGHT', 'MEDIUM'],  // ágil
  mage:    ['LIGHT'],            // tecido/vestes
  monk:    ['LIGHT', 'MEDIUM'],  // marcial ágil
};

// Tipos de ARMA (primária + secundária) de cada classe.
const CLASS_WEAPONS: Record<ClassId, ItemTypeStr[]> = {
  warrior: ['SWORD', 'AXE', 'SHIELD'],
  rogue:   ['DAGGER', 'BOW'],
  mage:    ['STAFF', 'ORB'],
  monk:    ['GAUNTLET'],
};

const CLASS_LABEL: Record<ClassId, string> = {
  warrior: 'Guerreiro', rogue: 'Ladino', mage: 'Mago', monk: 'Monge',
};

// Tipos que são ARMA (sujeitos à restrição de arma por classe).
const WEAPON_TYPES: ItemTypeStr[] = ['SWORD', 'AXE', 'DAGGER', 'STAFF', 'BOW', 'GAUNTLET', 'ORB', 'SHIELD'];

function isClassId(v: string): v is ClassId {
  return v === 'warrior' || v === 'rogue' || v === 'mage' || v === 'monk';
}

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

/**
 * Verifica a exclusividade de RAÇA do item (itens lendários raceRestriction).
 * A restrição de peso/arma virou responsabilidade da CLASSE (canClassEquip).
 */
export function canRaceEquip(
  race: string | null | undefined,
  _itemType: ItemTypeStr,
  raceRestriction?: RaceId | null,
): { ok: boolean; reason?: string } {
  const r = (race || '').toLowerCase();
  if (raceRestriction && r !== raceRestriction) {
    return { ok: false, reason: `Item exclusivo da raça ${RACE_LABEL[raceRestriction]}.` };
  }
  return { ok: true };
}

/**
 * Verifica se uma CLASSE pode equipar um item: tipo de arma (primária/secundária)
 * e peso de armadura permitidos. Classe desconhecida não bloqueia.
 */
export function canClassEquip(
  charClass: string | null | undefined,
  itemType: ItemTypeStr,
): { ok: boolean; reason?: string } {
  const c = (charClass || '').toLowerCase();
  if (!isClassId(c)) return { ok: true };

  // Arma: precisa estar na lista de armas da classe
  if (WEAPON_TYPES.includes(itemType)) {
    if (!CLASS_WEAPONS[c].includes(itemType)) {
      return { ok: false, reason: `${CLASS_LABEL[c]} não pode usar esse tipo de arma.` };
    }
    return { ok: true };
  }

  // Armadura: peso precisa ser permitido para a classe
  const weight = armorWeightOf(itemType);
  if (weight && !CLASS_ALLOWED_WEIGHT[c].includes(weight)) {
    const label = weight === 'LIGHT' ? 'leves' : weight === 'HEAVY' ? 'pesadas' : 'médias';
    return { ok: false, reason: `${CLASS_LABEL[c]} não pode usar armaduras ${label}.` };
  }
  return { ok: true };
}

/** Exclusividade de raça + restrição de classe (arma/peso) combinadas. */
export function canEquip(
  race: string | null | undefined,
  charClass: string | null | undefined,
  itemType: ItemTypeStr,
  raceRestriction?: RaceId | null,
): { ok: boolean; reason?: string } {
  const r = canRaceEquip(race, itemType, raceRestriction);
  if (!r.ok) return r;
  return canClassEquip(charClass, itemType);
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

/**
 * Sorteia um EQUIPAMENTO de espólio de masmorra que o personagem realmente
 * pode usar. Diferente de {@link rollDungeonDrop}, monta o pool por
 * ELEGIBILIDADE (classe + raça + nível) e por uma lista de raridades permitidas,
 * para que itens COMUNS/INCOMUNS de fato caiam (a base comum/incomum vem dos
 * itens-base da loja; o gear próprio da masmorra é RARO+).
 *
 *  - `rarities`: raridades liberadas para este sorteio (ex.: nó normal só
 *    COMMON/UNCOMMON; chefe libera RARE).
 *  - filtra por nível (item.level <= nível + folga) e por equipabilidade real
 *    (tipo de arma/peso da classe + exclusividade de raça).
 *  - pesa por raridade (COMMON domina), então o comum sai bem mais que o incomum.
 *
 * Retorna null se nada elegível.
 */
export function rollEquipmentDrop(
  dungeonId: string,
  characterLevel: number,
  race: string | null | undefined,
  charClass: string | null | undefined,
  rarities: Rarity[],
  opts: { mode?: 'own' | 'foreign' } = {},
  rng: () => number = Math.random,
): CatalogItem | null {
  const allow = new Set(rarities);
  const levelCap = characterLevel + 2; // folga pequena: drop útil para o nível atual
  const mode = opts.mode ?? 'own';

  const eligible = ITEM_CATALOG.filter((item) => {
    if (!allow.has(item.rarity)) return false;
    // Pool = gear próprio desta masmorra + itens-base da loja (fonte dos comuns/incomuns).
    const inDungeon = item.dungeons.includes(dungeonId);
    const isShopBase = item.source === 'shop';
    if (!inDungeon && !isShopBase) return false;
    if (item.level > levelCap) return false;
    if (mode === 'foreign') {
      // Espólio "de outra classe": item que ESTA classe NÃO equipa (incentivo a
      // criar outro personagem). Ignora raça (o teaser pode ser de outra raça).
      return !canClassEquip(charClass, item.type).ok;
    }
    return canEquip(race, charClass, item.type, item.raceRestriction).ok;
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
