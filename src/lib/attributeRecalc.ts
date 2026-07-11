/**
 * 🔢 Recálculo de atributos/derivados — miolo COMPARTILHADO entre a rota
 * distribute-points (fluxo legado) e a rota skill-tree/spend (nós de stat da árvore).
 *
 * Recebe os DELTAS de distribuição (podem ser negativos no respec) e devolve o
 * `data` pronto para o prisma.character.update — attributes + baseStats + hp/mp/
 * maxStamina — SEM mexer em availablePoints (responsabilidade de cada rota).
 * Regras preservadas do distribute-points original:
 *  • bônus de raça/classe convertidos de 0-100 → 0-10;
 *  • piso 8 em str/agi/int (DEF sem piso: RES baixa = mago matável);
 *  • NÃO reabastece a stamina atual (limitador diário) — só o teto.
 */
import type { Prisma } from '@prisma/client'
import { getRaceById, getClassById } from './gameData'
import { computeDerivedStats, criticalChancePct } from './combatFormulas'

export interface AttributeDeltas {
  str?: number
  agi?: number
  int?: number
  def?: number
}

export interface CharacterAttrSource {
  race: string
  class: string
  level: number | null
  attributes: unknown
}

export interface AttributeUpdateData {
  hp: number
  maxHp: number
  mp: number
  maxMp: number
  maxStamina: number
  baseStats: Prisma.InputJsonObject
  attributes: Prisma.InputJsonObject
}

export interface AttributeRecalcResult {
  data: AttributeUpdateData
  finals: { str: number; agi: number; int: number; def: number }
  distributed: { str: number; agi: number; int: number; def: number }
}

/**
 * Monta o update de atributos após somar `deltas` à distribuição atual.
 * Lança Error se raça/classe forem inválidas (rotas devolvem 400).
 */
export function buildAttributeUpdate(character: CharacterAttrSource, deltas: AttributeDeltas): AttributeRecalcResult {
  const raceData = getRaceById(character.race)
  const classData = getClassById(character.class)
  if (!raceData || !classData) {
    throw new Error('Invalid character race or class')
  }

  const addStr = deltas.str || 0
  const addAgi = deltas.agi || 0
  const addInt = deltas.int || 0
  const addDef = deltas.def || 0

  // Bônus raciais e de classe (0-100 → 0-10)
  const raceStr = Math.floor((raceData.bonuses.strength || 0) / 10)
  const raceAgi = Math.floor((raceData.bonuses.dexterity || 0) / 10)
  const raceInt = Math.floor((raceData.bonuses.intelligence || 0) / 10)
  const raceDef = Math.floor((raceData.bonuses.constitution || 0) / 10)

  const classStr = Math.floor((classData.bonuses.strength || 0) / 10)
  const classAgi = Math.floor((classData.bonuses.dexterity || 0) / 10)
  const classInt = Math.floor((classData.bonuses.intelligence || 0) / 10)
  const classDef = Math.floor((classData.bonuses.constitution || 0) / 10)

  const currentAttrs = (character.attributes as Record<string, number>) || {}
  const currentStr = (currentAttrs.distributedStr || 0) + addStr
  const currentAgi = (currentAttrs.distributedAgi || 0) + addAgi
  const currentInt = (currentAttrs.distributedInt || 0) + addInt
  const currentDef = (currentAttrs.distributedDef || 0) + addDef

  // Piso de 8 em str/agi/int (sem atributo ZERO → transformação sempre buffa,
  // poder unificado str+int nunca morre). DEF sem piso.
  const finalStr = Math.max(8, currentStr + raceStr + classStr)
  const finalAgi = Math.max(8, currentAgi + raceAgi + classAgi)
  const finalInt = Math.max(8, currentInt + raceInt + classInt)
  const finalDef = currentDef + raceDef + classDef

  // 🎯 Fórmulas unificadas (validadas via simulação — src/lib/combatFormulas.ts)
  const derived = computeDerivedStats({
    str: finalStr,
    agi: finalAgi,
    int: finalInt,
    def: finalDef,
    level: character.level || 1,
  })
  const newHp = derived.maxHp
  const newMp = derived.maxMp
  const newStamina = derived.maxStamina
  const newRes = derived.res

  const newAttack = Math.floor(finalStr * 1.5)
  const newDefense = finalDef
  const newCritical = criticalChancePct(finalAgi)
  const newMagicPower = Math.floor(finalInt * 1.5)
  const newDodgeChance = Math.floor(finalAgi / 5)
  const newMagicResistance = newRes

  return {
    finals: { str: finalStr, agi: finalAgi, int: finalInt, def: finalDef },
    distributed: { str: currentStr, agi: currentAgi, int: currentInt, def: currentDef },
    data: {
      hp: newHp,
      maxHp: newHp,
      mp: newMp,
      maxMp: newMp,
      // NÃO reabastece a stamina atual: só recalcula o TETO (maxStamina).
      maxStamina: newStamina,
      baseStats: {
        str: finalStr,
        agi: finalAgi,
        int: finalInt,
        def: finalDef,
        res: newRes,
        hp: newHp,
        maxHp: newHp,
        mp: newMp,
        maxMp: newMp,
        stamina: newStamina,
        maxStamina: newStamina,
        attack: newAttack,
        defense: newDefense,
        critical: newCritical,
        crit: newCritical, // alias lido pela página de combate
        magicPower: newMagicPower,
        dodgeChance: newDodgeChance,
        magicResistance: newMagicResistance,
        raceBonuses: {
          str: raceStr, agi: raceAgi, int: raceInt, def: raceDef,
          abilities: raceData.abilities,
        },
        classBonuses: {
          str: classStr, agi: classAgi, int: classInt, def: classDef,
          abilities: classData.abilities,
        },
      },
      attributes: {
        ...((character.attributes as Record<string, unknown>) || {}),
        distributedStr: currentStr,
        distributedAgi: currentAgi,
        distributedInt: currentInt,
        distributedDef: currentDef,
        str: finalStr,
        agi: finalAgi,
        int: finalInt,
        def: finalDef,
        crit: newCritical,
        speed: finalAgi * 0.5,
        magicResistance: newMagicResistance,
        dodgeChance: newDodgeChance,
        // Compatibilidade com sistema antigo
        strength: finalStr,
        agility: finalAgi,
        intelligence: finalInt,
        defense: finalDef,
      },
    },
  }
}
