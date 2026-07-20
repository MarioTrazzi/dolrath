// Nomes de combate (transformações, especiais de forma, ataque de classe, árvore de
// habilidades) — fonte PT continua CONGELADA em transformationSystem.ts/
// transformationSpecials.ts/combatModel.ts/skillTree.ts (servidor/socket-server.js
// compartilha essas strings; mudar a fonte quebraria a sincronia). Este módulo é o
// mapa reverso PT→EN só para DISPLAY, no mesmo espírito de catalogNames.ts.
import type { Locale } from './config'

/** Nome da transformação (TRANSFORMATION_CONFIG[type].name / FORM_LABEL). */
export const TRANSFORMATION_NAME_EN: Record<string, string> = {
  '🐉 Dragão': '🐉 Dragon',
  '🐺 Lobo': '🐺 Wolf',
  '🐻 Urso': '🐻 Bear',
  '🦅 Águia': '🦅 Eagle',
  '✨ Despertar do 7º Sentido': '✨ Seventh Sense Awakening',
  '🌟 Forma Celestial': '🌟 Celestial Form',
}

export const TRANSFORMATION_DESC_EN: Record<string, string> = {
  'Transformação ancestral dracônica que aumenta drasticamente força e resistência':
    'Ancestral draconic transformation that drastically boosts strength and resilience',
  'Forma predatória focada em velocidade e ataques críticos':
    'Predatory form focused on speed and critical strikes',
  'Forma defensiva suprema com alta resistência e força bruta':
    'Supreme defensive form with high resilience and raw strength',
  'Forma aérea focada em esquiva suprema e ataques precisos':
    'Aerial form focused on supreme evasion and precise strikes',
  'O humano desperta o cosmo interior: reflexos, força e mente elevados em harmonia. Forma versátil, sem fraquezas marcantes.':
    'The human awakens their inner cosmos: reflexes, strength and mind elevated in harmony. A versatile form, without notable weaknesses.',
  'O elfo ascende a uma forma de luz astral, amplificando drasticamente o poder mágico e os reflexos — mas com corpo etéreo e frágil.':
    'The elf ascends into a form of astral light, drastically amplifying magic power and reflexes — but with a fragile, ethereal body.',
}

/** Especiais de forma (name) — compartilhado entre TRANSFORMATION_CONFIG.specialAbilities
 *  e TRANSFORMATION_SPECIALS (mesmo texto PT nos dois lugares). */
export const SPECIAL_NAME_EN: Record<string, string> = {
  '🔥 Sopro de Fogo': '🔥 Fire Breath',
  '💫 Golpe Atordoante': '💫 Stunning Strike',
  '🛡️ Escama de Dragão': '🛡️ Dragon Scale',
  '🩸 Mordida Sangrenta': '🩸 Bleeding Bite',
  '😤 Fúria Selvagem': '😤 Wild Fury',
  '💥 Investida Imparável': '💥 Unstoppable Charge',
  '🛡️ Pele de Ferro': '🛡️ Iron Hide',
  '🌀 Espiral Ascendente': '🌀 Ascending Spiral',
  '🌬️ Voo Veloz': '🌬️ Swift Flight',
  '🌌 Explosão de Cosmo': '🌌 Cosmo Burst',
  '🧘 Meditação': '🧘 Meditation',
  '💥 Super Nova': '💥 Super Nova',
  '✨ Hyperfoco': '✨ Hyperfocus',
}

export const SPECIAL_DESC_EN: Record<string, string> = {
  'Ataque de fogo (d20) que fura 60% da armadura': 'Fire attack (d20) that pierces 60% of armor',
  'Dano de fogo que fura 60% da armadura (d20)': 'Fire damage that pierces 60% of armor (d20)',
  'Golpe leve e esquivável (d20); rolagem ≥15 atordoa o alvo por 1 turno':
    'Light, dodgeable strike (d20); a roll of ≥15 stuns the target for 1 turn',
  'Dano leve; rolagem ≥15 ATORDOA o alvo por 1 turno (chefes resistem) (d20)':
    'Light damage; a roll of ≥15 STUNS the target for 1 turn (bosses resist) (d20)',
  'Reduz o dano recebido em 24% por 3 turnos': 'Reduces damage taken by 24% for 3 turns',
  '-24% dano recebido por 3 turnos': '-24% damage taken for 3 turns',
  'Ataque (d20) que ignora a armadura e causa sangramento por 3 turnos':
    'Attack (d20) that ignores armor and causes bleeding for 3 turns',
  'Ignora a armadura + sangramento (3%/turno, 3t) (d20)':
    'Ignores armor + bleeding (3%/turn, 3t) (d20)',
  '+20% de dano causado por 3 turnos': '+20% damage dealt for 3 turns',
  'Ataque (d20) que atravessa toda a armadura': 'Attack (d20) that pierces all armor',
  'Ignora TODA a armadura (d20)': 'Ignores ALL armor (d20)',
  'Reduz o dano recebido em 20% por 3 turnos': 'Reduces damage taken by 20% for 3 turns',
  '-20% dano recebido por 3 turnos': '-20% damage taken for 3 turns',
  'Mergulho em espiral (d20) que fura 60% da armadura':
    'Spiral dive (d20) that pierces 60% of armor',
  'Mergulho em espiral (fura 60% da armadura) (d20)':
    'Spiral dive (pierces 60% of armor) (d20)',
  '+45% de evasão por 3 turnos': '+45% evasion for 3 turns',
  'Explosão de cosmo concentrada (d20)': 'Concentrated cosmic burst (d20)',
  'Cura 14% do HP máximo': 'Heals 14% of max HP',
  'Explosão de luz (d20) que fura 50% da armadura': 'Light explosion (d20) that pierces 50% of armor',
  'Explosão de luz que fura 50% da armadura (d20)': 'Light explosion that pierces 50% of armor (d20)',
  '+30% de dano causado por 3 turnos': '+30% damage dealt for 3 turns',
}

export const DOT_LABEL_EN: Record<string, string> = {
  sangramento: 'bleeding',
}

/** Ataque de Classe por classe (combatModel.CLASS_ATTACK_NAME). */
export const CLASS_ATTACK_NAME_EN: Record<string, string> = {
  'Investida Pesada': 'Heavy Charge',
  'Ataque Furtivo': 'Sneak Attack',
  'Bola de Fogo': 'Fireball',
  'Golpe Triplo': 'Triple Strike',
}

/** Rótulo do tipo de ataque (combatModel ATTACK_KINDS[].label: Golpe/Ataque de Classe/Especial). */
export const ATTACK_KIND_LABEL_EN: Record<string, string> = {
  Golpe: 'Strike',
  'Ataque de Classe': 'Class Attack',
  Especial: 'Special',
}

/** Árvore de habilidades (skillTree.ts) — rótulos de caminho, nome da forma-caminho,
 *  capstone primário e nós fixos que se repetem em toda classe/forma. */
export const STAT_LABEL_EN: Record<string, string> = {
  Força: 'Strength',
  Agilidade: 'Agility',
  Inteligência: 'Intelligence',
  Defesa: 'Defense',
}

export const PATH_LABEL_EN: Record<string, string> = {
  'Fúria de Batalha': 'Battle Fury',
  'Defesa Férrea': 'Iron Defense',
  'Instinto Predador': 'Predator Instinct',
  'Ataque Furtivo': 'Sneak Attack',
  'Esquiva Aprimorada': 'Enhanced Evasion',
  'Golpe Sombrio': 'Shadow Strike',
  'Maestria Arcana': 'Arcane Mastery',
  'Escudo Mágico': 'Magic Shield',
  'Golpe Arcano': 'Arcane Strike',
  'Rajada de Socos': 'Flurry of Blows',
  'Corpo de Ferro': 'Iron Body',
  'Punho de Ferro': 'Iron Fist',
}

export const FORM_PATH_LABEL_EN: Record<string, string> = {
  'Dragão Interior': 'Inner Dragon',
  'Lobo Interior': 'Inner Wolf',
  'Urso Interior': 'Inner Bear',
  'Águia Interior': 'Inner Eagle',
  'Sétimo Sentido': 'Seventh Sense',
  'Forma Celestial': 'Celestial Form',
  'Instintos Selvagens': 'Wild Instincts',
}

export const PRIMARY_CAPSTONE_NAME_EN: Record<string, string> = {
  'Golpe Devastador': 'Devastating Blow',
  'Precisão Mortal': 'Deadly Precision',
  'Fúria Arcana': 'Arcane Fury',
  'Punho Trovejante': 'Thundering Fist',
}

/** Nós fixos que aparecem em toda classe/forma (mesmo texto, sem variação). */
export const SKILL_NODE_FIXED_EN: Record<string, string> = {
  '🧱 Vitalidade': '🧱 Vitality',
  '🏆 Baluarte': '🏆 Bulwark',
  '🌬️ Passo Lateral': '🌬️ Sidestep',
  '🏆 Reflexos de Batalha': '🏆 Battle Reflexes',
  '🔮 Reservas Arcanas': '🔮 Arcane Reserves',
  '🐾 Golpe da Forma': "🐾 Form's Strike",
  '🛡️ Vigor da Forma': "🛡️ Form's Vigor",
}

function lookup(map: Record<string, string>, pt: string, locale: Locale): string {
  if (locale !== 'en') return pt
  return map[pt] ?? pt
}

export const localizeTransformationName = (pt: string, locale: Locale) => lookup(TRANSFORMATION_NAME_EN, pt, locale)
export const localizeTransformationDesc = (pt: string, locale: Locale) => lookup(TRANSFORMATION_DESC_EN, pt, locale)
export const localizeSpecialName = (pt: string, locale: Locale) => lookup(SPECIAL_NAME_EN, pt, locale)
export const localizeSpecialDesc = (pt: string, locale: Locale) => lookup(SPECIAL_DESC_EN, pt, locale)
export const localizeDotLabel = (pt: string, locale: Locale) => lookup(DOT_LABEL_EN, pt, locale)
export const localizeClassAttackName = (pt: string, locale: Locale) => lookup(CLASS_ATTACK_NAME_EN, pt, locale)
export const localizeAttackKindLabel = (pt: string, locale: Locale) => lookup(ATTACK_KIND_LABEL_EN, pt, locale)
export const localizeStatLabel = (pt: string, locale: Locale) => lookup(STAT_LABEL_EN, pt, locale)
export const localizePathLabel = (pt: string, locale: Locale) => lookup(PATH_LABEL_EN, pt, locale)
export const localizeFormPathLabel = (pt: string, locale: Locale) => lookup(FORM_PATH_LABEL_EN, pt, locale)
export const localizePrimaryCapstoneName = (pt: string, locale: Locale) => lookup(PRIMARY_CAPSTONE_NAME_EN, pt, locale)

/** Nome de nó da árvore: tenta o mapa fixo, senão desmonta "<base> II/III" e traduz o
 *  prefixo por qualquer um dos mapas acima (especial de forma, capstone, path label,
 *  ataque de classe) preservando o sufixo de rank. Fallback = devolve o PT (ex.: stat
 *  node "+1 Força" — ver localizeSkillStatNodeName para esse caso específico). */
export function localizeSkillNodeName(pt: string, locale: Locale): string {
  if (locale !== 'en') return pt
  if (SKILL_NODE_FIXED_EN[pt]) return SKILL_NODE_FIXED_EN[pt]
  const rankMatch = pt.match(/^(.*?)( II| III)$/)
  const base = rankMatch ? rankMatch[1] : pt
  const suffix = rankMatch ? rankMatch[2] : ''
  const capstoneMatch = base.match(/^🏆 (.*)$/)
  if (capstoneMatch) {
    const inner = capstoneMatch[1]
    const en = PRIMARY_CAPSTONE_NAME_EN[inner] ?? FORM_PATH_LABEL_EN[inner] ?? inner
    return `🏆 ${en}${suffix}`
  }
  const classAttackMatch = base.match(/^⚔️ (.*)$/)
  if (classAttackMatch) {
    const inner = classAttackMatch[1]
    return `⚔️ ${CLASS_ATTACK_NAME_EN[inner] ?? inner}${suffix}`
  }
  const en = SPECIAL_NAME_EN[base] ?? SKILL_NODE_FIXED_EN[base]
  if (en) return `${en}${suffix}`
  return `${base}${suffix}`
}

/** Nó de stat: "+1 Força" → "+1 Strength". */
export function localizeSkillStatNodeName(pt: string, locale: Locale): string {
  if (locale !== 'en') return pt
  const m = pt.match(/^(\+\d+) (.*)$/)
  if (!m) return pt
  return `${m[1]} ${STAT_LABEL_EN[m[2]] ?? m[2]}`
}
