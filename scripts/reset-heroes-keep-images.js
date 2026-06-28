// ⚠️ DESTRUTIVO (mas PRESERVA IMAGENS) — reseta TODO personagem para o estado
// "fresh level 1", recriando os stats com o balanceamento atual, SEM apagar o
// personagem (mantém avatar + transformationImage(s) + identidade + NFT).
//
// O que faz, por personagem:
//   • level=1, experience=0, gold=0, availablePoints=18 (orçamento de criação)
//   • pontos distribuídos zerados → stats recalculados no baseline nv1 + piso 8
//     (usa raceBonuses/classBonuses já gravados em baseStats — abilities preservadas)
//   • hp/mp/stamina cheios; isAlive=true; failstacks=0; transformação limpa
//   • apaga inventário, equipamento, histórico e dungeon runs do personagem
// Conta (clean slate): goldBalance=1000, globalInventorySlots=50, UserInventory vazio.
// PRESERVA: avatar, transformationImage, transformationImages, unlockedTransformation,
//           name/race/class, e todos os campos de NFT.
//
// USO (DATABASE_URL deve apontar p/ o banco certo — prod = Neon):
//   Dry-run (não escreve nada):   node scripts/reset-heroes-keep-images.js
//   Execução real:                CONFIRM=RESET_ALL node scripts/reset-heroes-keep-images.js

const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

const CREATION_POINTS = 18
const DEFAULT_GOLD = 1000
const DEFAULT_GLOBAL_SLOTS = 50
const DEFAULT_INV_SLOTS = 10

// Recalcula stats nv1 (distribuído = 0). Espelha src/app/api/character/route.ts.
function freshStats(baseStats) {
  const rb = (baseStats && baseStats.raceBonuses) || {}
  const cb = (baseStats && baseStats.classBonuses) || {}
  if (rb.str === undefined || cb.str === undefined) {
    throw new Error('baseStats sem raceBonuses/classBonuses — não dá p/ recomputar com segurança')
  }
  const raceStr = rb.str | 0, raceAgi = rb.agi | 0, raceInt = rb.int | 0, raceDef = rb.def | 0
  const classStr = cb.str | 0, classAgi = cb.agi | 0, classInt = cb.int | 0, classDef = cb.def | 0

  // Piso de 8 em str/agi/int (DEF sem piso) — igual ao servidor.
  const finalStr = Math.max(8, raceStr + classStr)
  const finalAgi = Math.max(8, raceAgi + classAgi)
  const finalInt = Math.max(8, raceInt + classInt)
  const finalDef = raceDef + classDef

  const baseHp = 80 + finalStr * 2 + finalDef * 4
  const baseMp = 60 + finalInt * 3 + finalAgi * 1
  const baseStamina = 120 + finalAgi * 3

  const newBaseStats = {
    hp: baseHp, maxHp: baseHp,
    mp: baseMp, maxMp: baseMp,
    stamina: baseStamina, maxStamina: baseStamina,
    str: finalStr, agi: finalAgi, int: finalInt, def: finalDef,
    attack: Math.floor(finalStr * 1.2),
    defense: Math.floor(finalDef * 0.8),
    critical: finalAgi * 0.8 + 5,
    magicPower: Math.floor(finalInt * 1.5),
    dodgeChance: finalAgi * 0.3,
    magicResistance: Math.floor(finalInt * 0.4),
    raceBonuses: rb,   // preserva (inclui abilities)
    classBonuses: cb,  // preserva (inclui abilities)
  }
  return { newBaseStats, baseHp, baseMp, baseStamina, finalStr, finalAgi, finalInt, finalDef }
}

async function main() {
  const live = process.env.CONFIRM === 'RESET_ALL'
  const chars = await prisma.character.findMany({
    select: { id: true, name: true, race: true, class: true, level: true, gold: true,
              avatar: true, transformationImage: true, baseStats: true, attributes: true },
  })
  const [users, ui] = await Promise.all([prisma.user.count(), prisma.userInventory.count()])
  console.log(`🔎 ${chars.length} personagens, ${users} usuários, ${ui} itens no baú geral (UserInventory)\n`)

  // Prévia de um personagem
  if (chars.length) {
    const c = chars[0]
    const f = freshStats(c.baseStats)
    console.log(`Exemplo — ${c.name} (${c.race}/${c.class}) nv${c.level} gold ${c.gold}`)
    console.log(`  → nv1, gold 0, ${CREATION_POINTS} pts livres; str/agi/int/def = ${f.finalStr}/${f.finalAgi}/${f.finalInt}/${f.finalDef}; hp ${f.baseHp} mp ${f.baseMp} stam ${f.baseStamina}`)
    console.log(`  imagens preservadas: avatar=${c.avatar ? 'sim' : 'não'} transformImage=${c.transformationImage ? 'sim' : 'não'}\n`)
  }

  if (!live) {
    console.log('🟡 DRY-RUN — nada foi escrito. Para executar: CONFIRM=RESET_ALL node scripts/reset-heroes-keep-images.js')
    return
  }

  let ok = 0
  for (const c of chars) {
    const f = freshStats(c.baseStats)
    const attrs = (c.attributes && typeof c.attributes === 'object') ? c.attributes : {}
    const newAttributes = {
      ...attrs,
      distributedStr: 0, distributedAgi: 0, distributedInt: 0, distributedDef: 0,
      str: f.finalStr, agi: f.finalAgi, int: f.finalInt, def: f.finalDef,
      crit: f.finalAgi * 0.8 + 5,
      speed: f.finalAgi * 0.5,
      magicResistance: f.finalInt * 0.2 + f.finalDef * 0.1,
      isTransformed: false, transformationType: null, transformationData: null,
    }
    await prisma.$transaction([
      prisma.characterInventory.deleteMany({ where: { characterId: c.id } }),
      prisma.characterEquipment.deleteMany({ where: { characterId: c.id } }),
      prisma.characterHistory.deleteMany({ where: { characterId: c.id } }),
      prisma.dungeonRun.deleteMany({ where: { characterId: c.id } }),
      prisma.character.update({
        where: { id: c.id },
        data: {
          level: 1, experience: 0, gold: 0, availablePoints: CREATION_POINTS,
          inventorySlots: DEFAULT_INV_SLOTS, failstacks: 0,
          baseStats: f.newBaseStats, attributes: newAttributes,
          hp: f.baseHp, maxHp: f.baseHp, mp: f.baseMp, maxMp: f.baseMp,
          stamina: f.baseStamina, maxStamina: f.baseStamina, staminaUpdatedAt: new Date(),
          isAlive: true, deathTimestamp: null,
          isTransformed: false, transformationType: null, transformationData: null,
        },
      }),
    ])
    ok++
    console.log(`  ✓ ${c.name} resetado`)
  }

  // Conta: clean slate de economia
  await prisma.userInventory.deleteMany({})
  const uRes = await prisma.user.updateMany({ data: { goldBalance: DEFAULT_GOLD, globalInventorySlots: DEFAULT_GLOBAL_SLOTS } })
  console.log(`\n✅ ${ok} personagens resetados | baú geral esvaziado | ${uRes.count} contas com gold=${DEFAULT_GOLD}`)
}

main()
  .catch((e) => { console.error('❌ Erro:', e); process.exitCode = 1 })
  .finally(async () => { await prisma.$disconnect() })
