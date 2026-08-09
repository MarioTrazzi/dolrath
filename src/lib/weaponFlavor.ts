/**
 * ⚔️ FLAVOR POR ARMA — nome exibido e "entrega" visual dos golpes conforme a arma equipada.
 *
 * Camada 100% de DISPLAY. Os nomes canônicos (`SpecialDef.name` em transformationSpecials.ts,
 * `CLASS_ATTACK_NAME` em combatModel.ts) continuam CONGELADOS: `server/socket-server.js`
 * compartilha as strings PT literais e `i18n/combatNames.ts` as usa como chave. Aqui nada de
 * dano/custo/cd é tocado — trocar de arma muda só a PELE do golpe, então o balanceamento
 * (scripts/pvp-lever-sim.js e cia.) segue válido sem revalidar.
 *
 * Um especial por forma continua sendo UM especial; a arma escolhe como ele se apresenta:
 * 🌌 Explosão de Cosmo com arco = 🌌 Flecha Cósmica; com adaga = 🌌 Relâmpago Cósmico.
 */
import { normalizeCombatClass } from './combatModel'
import type { SpecialDef } from './transformationSpecials'

/** As 6 famílias de arma primária que existem em CLASS_WEAPONS (itemCatalog.ts). */
export type WeaponFamily = 'sword' | 'axe' | 'dagger' | 'bow' | 'staff' | 'fist' | 'none'

/** Como o golpe VIAJA até o alvo — é isto que decide a animação, não a família em si. */
export type Delivery = 'melee' | 'ranged' | 'channel'

const FAMILY_BY_TYPE: Record<string, WeaponFamily> = {
  SWORD: 'sword',
  AXE: 'axe',
  DAGGER: 'dagger',
  BOW: 'bow',
  STAFF: 'staff',
  GAUNTLET: 'fist',
}

/**
 * Família da arma equipada no slot WEAPON. Ferramenta de coleta (picareta, foice, vara…)
 * também ocupa esse slot — coletar te deixa "desarmado", então cai em `none` e o combate
 * mantém a aparência antiga.
 */
export function weaponFamily(itemType: string | null | undefined): WeaponFamily {
  return FAMILY_BY_TYPE[String(itemType || '').toUpperCase()] || 'none'
}

export function weaponDelivery(family: WeaponFamily): Delivery {
  if (family === 'bow') return 'ranged'
  if (family === 'staff') return 'channel'
  return 'melee'
}

// ============================================================
// Nomes dos especiais de forma por arma
// ============================================================

type WeaponNames = Partial<Record<WeaponFamily, string>>

/**
 * `id do especial` → nome por família. Sem entrada ⇒ o nome canônico da forma continua
 * valendo (é o caso da arma que já "casa" com o especial: cajado + Explosão de Cosmo,
 * manopla + Investida Imparável, e por aí).
 */
export const SPECIAL_WEAPON_NAME: Record<string, WeaponNames> = {
  // 🔥 Dragão
  dragon_breath: {
    sword: '🔥 Lâmina Flamejante',
    axe: '🔥 Machado Vulcânico',
    dagger: '🔥 Presa Incandescente',
    bow: '🔥 Flecha Flamejante',
    fist: '🔥 Punho Dracônico',
  },
  // 🩸 Lobo
  bite_bleeding: {
    sword: '🩸 Lâmina Dilacerante',
    axe: '🩸 Talho Sangrento',
    dagger: '🩸 Presa Sangrenta',
    bow: '🩸 Flecha Dilacerante',
    staff: '🩸 Maldição Sangrenta',
  },
  // 💥 Urso
  unstoppable_charge: {
    sword: '💥 Estocada Imparável',
    axe: '💥 Machadada Imparável',
    dagger: '💥 Arremetida Imparável',
    bow: '💥 Flecha Perfurante',
    staff: '💥 Impacto Telúrico',
  },
  // 🌀 Águia
  ascending_spiral: {
    sword: '🌀 Lâmina Ciclônica',
    axe: '🌀 Machado Ciclônico',
    dagger: '🌀 Corte Vertiginoso',
    bow: '🌀 Flecha Vendaval',
    staff: '🌀 Vendaval Ascendente',
    fist: '🌀 Punho do Vendaval',
  },
  // 🌌 Sétimo Sentido
  cosmo_burst: {
    sword: '🌌 Lâmina Cósmica',
    axe: '🌌 Machado Cósmico',
    dagger: '🌌 Relâmpago Cósmico',
    bow: '🌌 Flecha Cósmica',
    fist: '🌌 Punho do Cosmo',
  },
  // ✨ Celestial
  super_nova: {
    sword: '✨ Lâmina Estelar',
    axe: '✨ Machado Estelar',
    dagger: '✨ Estilhaço Estelar',
    bow: '✨ Flecha Estelar',
    fist: '✨ Punho Supernova',
  },
  // 💫 compartilhado pelas 6 formas
  stunning_blow: {
    sword: '💫 Golpe de Pomo',
    axe: '💫 Golpe de Cabo',
    dagger: '💫 Punhalada Ofuscante',
    bow: '💫 Flecha Ofuscante',
    staff: '💫 Pancada Arcana',
  },
}

/** Sufixo de rank que o applyRankPatch (skillTree.ts) anexa ao nome antes da UI. */
const RANK_SUFFIX = /\s(I{2,3})$/

/**
 * Nome do especial já com o tempero da arma. Preserva o sufixo de rank (` II`/` III`)
 * que a árvore de habilidades anexou, e cai no nome canônico quando não há entrada.
 */
export function specialDisplayName(def: SpecialDef, weaponType: string | null | undefined): string {
  const base = SPECIAL_WEAPON_NAME[def.id]?.[weaponFamily(weaponType)]
  if (!base) return def.name
  const rank = def.name.match(RANK_SUFFIX)
  return rank ? `${base} ${rank[1]}` : base
}

// ============================================================
// Ataque de Classe (d8) por arma
// ============================================================

/**
 * Só Guerreiro e Ladino têm duas armas primárias (CLASS_WEAPONS), então só eles variam:
 * o Mago tem cajado e o Monge, manopla — nesses o nome canônico já é o certo.
 */
const CLASS_ATTACK_WEAPON_NAME: Record<string, WeaponNames> = {
  warrior: { axe: 'Machadada Pesada' },
  rogue: { bow: 'Tiro Certeiro' },
}

/** Nome do Ataque de Classe considerando a arma; fallback = classAttackName(). */
export function classAttackDisplayName(
  rawClass: string | null | undefined,
  weaponType: string | null | undefined,
  fallback: string,
): string {
  const cls = normalizeCombatClass(rawClass)
  if (!cls) return fallback
  return CLASS_ATTACK_WEAPON_NAME[cls]?.[weaponFamily(weaponType)] || fallback
}
