import { Locale } from './config'

// 🌐 Display EN de raças/classes/habilidades — chaveado pelo ID estável
// (raça/classe) ou pelo nome PT (habilidades/transformações). Os ids
// internos ('draconiano', 'warrior'…) NUNCA mudam; isto é só display.

export const RACE_EN: Record<string, { name: string; description: string }> = {
  humano: { name: 'Human', description: 'Versatile, with superior growth and the Awakening of the 7th Sense' },
  draconiano: { name: 'Draconian', description: 'Descendants of dragons with the power of transformation' },
  metamorfo: { name: 'Shapeshifter', description: 'Able to transform into animals, excellent at evasion' },
  elfo: { name: 'Elf', description: 'Supreme magical masters who ascend to the Celestial Form' },
}

export const CLASS_EN: Record<string, { name: string; description: string }> = {
  warrior: { name: 'Warrior', description: 'Specialist in melee combat with heavy weapons' },
  rogue: { name: 'Rogue', description: 'Specialist in fast, stealthy attacks' },
  mage: { name: 'Mage', description: 'Wielder of arcane energies and powerful spells' },
  monk: { name: 'Monk', description: 'Unarmed fighter who wields their own body as a weapon' },
}

// Habilidades/transformações (nomes PT dos catálogos gameData/characterCreationData).
export const ABILITY_EN: Record<string, string> = {
  'Adaptabilidade Suprema': 'Supreme Adaptability',
  'Crescimento Acelerado': 'Accelerated Growth',
  'Despertar do 7º Sentido': '7th Sense Awakening',
  'Transformação Dracônica': 'Draconic Transformation',
  'Transformação em Dragão': 'Dragon Transformation',
  'Resistência ao Fogo': 'Fire Resistance',
  'Escamas Protetoras': 'Protective Scales',
  'Transformação Animal': 'Animal Transformation',
  'Instintos Selvagens': 'Wild Instincts',
  'Agilidade Aprimorada': 'Improved Agility',
  'Maestria Arcana': 'Arcane Mastery',
  'Tiro Certeiro Élfico': 'Elven Deadeye Shot',
  'Forma Celestial': 'Celestial Form',
  'Fúria de Batalha': 'Battle Fury',
  'Defesa Férrea': 'Iron Defense',
  'Golpe Devastador': 'Devastating Blow',
  'Ataque Furtivo': 'Sneak Attack',
  'Esquiva Aprimorada': 'Improved Evasion',
  'Precisão Mortal': 'Deadly Precision',
  'Bola de Fogo': 'Fireball',
  'Escudo Mágico': 'Magic Shield',
  'Cura Menor': 'Lesser Heal',
  'Punho de Ferro': 'Iron Fist',
  'Meditação': 'Meditation',
  'Rajada de Socos': 'Flurry of Punches',
  'Dragão': 'Dragon',
  'Qualquer Animal': 'Any Animal',
  'Urso': 'Bear',
  'Sétimo Sentido': 'Seventh Sense',
}

export function localizeRaceName(raceId: string, ptName: string, locale: Locale): string {
  if (locale === 'pt') return ptName
  return RACE_EN[raceId]?.name ?? ptName
}

export function localizeClassName(classId: string, ptName: string, locale: Locale): string {
  if (locale === 'pt') return ptName
  return CLASS_EN[classId]?.name ?? ptName
}

export function localizeAbility(ptName: string, locale: Locale): string {
  if (locale === 'pt') return ptName
  return ABILITY_EN[ptName] ?? ptName
}

/** EN canônico p/ NFT metadata (independe de locale). */
export function raceNameEn(raceIdOrPtName: string): string {
  const byId = RACE_EN[raceIdOrPtName]
  if (byId) return byId.name
  const hit = Object.values(RACE_EN).find((r) => r.name === raceIdOrPtName)
  if (hit) return hit.name
  const PT_TO_ID: Record<string, string> = { Humano: 'humano', Draconiano: 'draconiano', Metamorfo: 'metamorfo', Elfo: 'elfo' }
  const id = PT_TO_ID[raceIdOrPtName]
  return id ? RACE_EN[id].name : raceIdOrPtName
}

export function classNameEn(classIdOrPtName: string): string {
  const byId = CLASS_EN[classIdOrPtName]
  if (byId) return byId.name
  const hit = Object.values(CLASS_EN).find((c) => c.name === classIdOrPtName)
  if (hit) return hit.name
  const PT_TO_ID: Record<string, string> = { Guerreiro: 'warrior', Ladino: 'rogue', Mago: 'mage', Monge: 'monk' }
  const id = PT_TO_ID[classIdOrPtName]
  return id ? CLASS_EN[id].name : classIdOrPtName
}
