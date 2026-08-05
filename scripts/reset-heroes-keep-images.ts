/**
 * DESTRUTIVO (mas PRESERVA IMAGENS) — reseta TODO personagem para fresh level 1,
 * re-rolando os 18 pontos de criação com o perfil da CLASSE de cada herói
 * (mesma lógica de src/lib/characterStats.ts / POST /api/character).
 *
 * PRESERVA SEMPRE: avatar, transformationImage, transformationImages,
 *   unlockedTransformation, name/race/class. Nenhuma flag toca nessas colunas —
 *   as imagens custam gpt-image-1 e são o único ativo que não se regenera de graça.
 *
 * POR PERSONAGEM:
 *   • Rola 18 pts via rollCreationStats(seed, classId) — seed aleatória por herói
 *   • Stats finais = rolled + race/class bonuses + piso 8 em str/agi/int
 *   • level=1, experience=0, gold=0, availablePoints=1
 *   • skillTree limpa { version, purchased: [] }
 *   • hp/mp/stamina cheios; failstacks=0; transformação limpa
 *   • apaga inventário, equipamento, histórico, dungeon runs e sessões de coleta
 *   • zera XP de profissões (gather/farm/forge/alchemy/process/cook)
 *
 * Conta: goldBalance=1000, globalInventorySlots=50, UserInventory vazio.
 *
 * ESCOPO EXTRA (opt-in) — o reset acima devolve o herói ao nível 1, mas não abre
 * uma TEMPORADA nova nem desfaz o vínculo com contratos antigos. Para isso:
 *
 *   RESET_ONCHAIN=1   Corta o vínculo on-chain: limpa nftChainId/nftContract/
 *                     nftTokenId/nftTokenUri/nftMintTxHash/nftMintedAt e
 *                     creationTxHash/creationPaidAt no personagem, e apaga
 *                     ItemNft, GoldTopup, GoldSale e AiGenPayment. É o que se
 *                     usa quando os contratos são redeployados (endereço novo
 *                     ⇒ os tokenIds antigos deixam de existir para o jogo).
 *                     Heróis podem ser re-cunhados depois em /dev/remint-characters.
 *
 *   RESET_PROGRESS=1  Apaga DungeonProgress (tiers destravados), QuestProgress,
 *                     FarmPlot e DailyLoginClaim. Sem isto o herói volta ao
 *                     nível 1 com o tier V da masmorra já aberto.
 *
 *   RESET_SEASON=1    Apaga toda PvpSeason — e por cascata PvpSeasonEntry,
 *                     PvpRating, PvpMatch, PvpSeasonPayout e
 *                     DolPrizeContribution — mais o PrizeVault. NÃO cria a
 *                     temporada nova: ensureActivePvpSeason() (src/lib/pvpRanking.ts)
 *                     cria "Temporada 1" com PVP_SEASON_DAYS no primeiro acesso
 *                     a /ranking ou na primeira luta.
 *
 * USO:
 *   Dry-run:  npx tsx scripts/reset-heroes-keep-images.ts
 *   Live:     CONFIRM=RESET_ALL npx tsx scripts/reset-heroes-keep-images.ts
 *   Temporada nova em contratos novos (ensaio v2 na Amoy):
 *     CONFIRM=RESET_ALL RESET_ONCHAIN=1 RESET_PROGRESS=1 RESET_SEASON=1 \
 *       npx tsx scripts/reset-heroes-keep-images.ts
 *
 * ⚠️ Não há guarda de ambiente: o script usa o DATABASE_URL do .env, que aponta
 *    para o Supabase de PRODUÇÃO.
 */

import { randomBytes } from 'crypto'
import { PrismaClient } from '@prisma/client'
import {
  computeCreationStats,
  rollCreationStats,
} from '../src/lib/characterStats'
import { getRaceById, getClassById } from '../src/lib/gameData'
import { SKILL_TREE_VERSION } from '../src/lib/skillTree'

const prisma = new PrismaClient()

const AVAILABLE_POINTS = 1
const DEFAULT_GOLD = 1000
const DEFAULT_GLOBAL_SLOTS = 50
const DEFAULT_INV_SLOTS = 10

/** Flag de escopo extra: aceita 1/true, qualquer outra coisa é desligado. */
function flag(name: string): boolean {
  const raw = (process.env[name] || '').trim().toLowerCase()
  return raw === '1' || raw === 'true'
}

const RESET_ONCHAIN = flag('RESET_ONCHAIN')
const RESET_PROGRESS = flag('RESET_PROGRESS')
const RESET_SEASON = flag('RESET_SEASON')

/**
 * Zera os campos que amarram o herói a um contrato específico. Fica separado
 * do payload base porque só entra com RESET_ONCHAIN — num reset de conteúdo
 * puro a NFT já cunhada continua válida.
 */
const ONCHAIN_CLEAR = {
  nftChainId: null,
  nftContract: null,
  nftTokenId: null,
  nftTokenUri: null,
  nftMintTxHash: null,
  nftMintedAt: null,
  creationTxHash: null,
  creationPaidAt: null,
} as const

function freshSeed(): number {
  return randomBytes(4).readUInt32BE(0)
}

function buildFreshCharacter(race: string, classId: string, seed: number) {
  const rolled = rollCreationStats(seed, classId)
  const stats = computeCreationStats(race, classId, rolled)
  const raceData = getRaceById(race)
  const classData = getClassById(classId)

  const { final, derived, race: raceB, class: classB } = stats

  const baseStats = {
    hp: derived.hp,
    maxHp: derived.hp,
    mp: derived.mp,
    maxMp: derived.mp,
    stamina: derived.stamina,
    maxStamina: derived.stamina,
    str: final.str,
    agi: final.agi,
    int: final.int,
    def: final.def,
    attack: derived.attack,
    defense: derived.defense,
    critical: derived.critical,
    magicPower: derived.magicPower,
    dodgeChance: derived.dodgeChance,
    magicResistance: derived.magicResistance,
    raceBonuses: {
      str: raceB.str,
      agi: raceB.agi,
      int: raceB.int,
      def: raceB.def,
      abilities: raceData?.abilities ?? [],
    },
    classBonuses: {
      str: classB.str,
      agi: classB.agi,
      int: classB.int,
      def: classB.def,
      abilities: classData?.abilities ?? [],
    },
  }

  const attributes = {
    distributedStr: rolled.str,
    distributedAgi: rolled.agi,
    distributedInt: rolled.int,
    distributedDef: rolled.def,
    str: final.str,
    agi: final.agi,
    int: final.int,
    def: final.def,
    crit: derived.critical,
    speed: derived.speed,
    magicResistance: final.int * 0.2 + final.def * 0.1,
    canTransform: raceData?.transformationAvailable ?? false,
    isTransformed: false,
    transformationType: null,
    transformationData: null,
    raceAbilities: raceData?.abilities ?? [],
    classAbilities: classData?.abilities ?? [],
    strength: final.str,
    agility: final.agi,
    intelligence: final.int,
    defense: final.def,
  }

  return { rolled, final, derived, baseStats, attributes }
}

/**
 * Mostra, antes de qualquer escrita, o que cada flag de escopo extra vai levar.
 * Flag desligada aparece como dica — é o jeito de descobrir que existe.
 */
async function reportExtraScope() {
  if (RESET_ONCHAIN) {
    const [minted, paid, itemNfts, topups, sales, aigen] = await Promise.all([
      prisma.character.count({ where: { nftTokenId: { not: null } } }),
      prisma.character.count({ where: { creationTxHash: { not: null } } }),
      prisma.itemNft.count(),
      prisma.goldTopup.count(),
      prisma.goldSale.count(),
      prisma.aiGenPayment.count(),
    ])
    console.log(
      `⛓️  RESET_ONCHAIN: ${minted} heróis cunhados e ${paid} com creationTxHash perdem o vínculo` +
        ` | apaga ${itemNfts} ItemNft, ${topups} GoldTopup, ${sales} GoldSale, ${aigen} AiGenPayment`
    )
  } else {
    console.log('⛓️  RESET_ONCHAIN=0 — vínculo de NFT/pagamento preservado (contratos NÃO mudaram)')
  }

  if (RESET_PROGRESS) {
    const [dungeon, quests, plots, logins] = await Promise.all([
      prisma.dungeonProgress.count(),
      prisma.questProgress.count(),
      prisma.farmPlot.count(),
      prisma.dailyLoginClaim.count(),
    ])
    console.log(
      `🗺️  RESET_PROGRESS: apaga ${dungeon} DungeonProgress, ${quests} QuestProgress,` +
        ` ${plots} FarmPlot, ${logins} DailyLoginClaim`
    )
  } else {
    console.log('🗺️  RESET_PROGRESS=0 — tiers de masmorra, missões, fazenda e login diário ficam')
  }

  if (RESET_SEASON) {
    const [seasons, entries, ratings, matches, payouts, contribs, vaults] = await Promise.all([
      prisma.pvpSeason.count(),
      prisma.pvpSeasonEntry.count(),
      prisma.pvpRating.count(),
      prisma.pvpMatch.count(),
      prisma.pvpSeasonPayout.count(),
      prisma.dolPrizeContribution.count(),
      prisma.prizeVault.count(),
    ])
    console.log(
      `🏆 RESET_SEASON: apaga ${seasons} PvpSeason (cascata: ${entries} inscrições,` +
        ` ${ratings} ratings, ${matches} partidas, ${payouts} pagamentos,` +
        ` ${contribs} contribuições) + ${vaults} PrizeVault`
    )
  } else {
    console.log('🏆 RESET_SEASON=0 — temporada, ranking e pool intactos')
  }
  console.log('')
}

async function main() {
  const live = process.env.CONFIRM === 'RESET_ALL'
  const chars = await prisma.character.findMany({
    select: {
      id: true,
      name: true,
      race: true,
      class: true,
      level: true,
      gold: true,
      avatar: true,
      transformationImage: true,
      transformationImages: true,
    },
  })
  const [users, ui] = await Promise.all([
    prisma.user.count(),
    prisma.userInventory.count(),
  ])

  console.log(
    `🔎 ${chars.length} personagens, ${users} usuários, ${ui} itens no baú geral (UserInventory)\n`
  )
  await reportExtraScope()
  console.log(
    live
      ? '🔴 LIVE — CONFIRM=RESET_ALL — vai gravar\n'
      : '🟡 DRY-RUN — nada será escrito\n'
  )

  const previews: Array<{
    id: string
    name: string
    race: string
    classId: string
    seed: number
    payload: ReturnType<typeof buildFreshCharacter>
  }> = []

  for (const c of chars) {
    const seed = freshSeed()
    const payload = buildFreshCharacter(c.race, c.class, seed)
    previews.push({
      id: c.id,
      name: c.name,
      race: c.race,
      classId: c.class,
      seed,
      payload,
    })
    const { rolled, final, derived } = payload
    console.log(
      `${c.name} (${c.race}/${c.class}) nv${c.level} gold ${c.gold}` +
        ` → rolled ${rolled.str}/${rolled.agi}/${rolled.int}/${rolled.def}` +
        ` | final ${final.str}/${final.agi}/${final.int}/${final.def}` +
        ` | hp ${derived.hp} mp ${derived.mp} stam ${derived.stamina}` +
        ` | pts=${AVAILABLE_POINTS}` +
        ` | imgs avatar=${c.avatar ? 'sim' : 'não'} transform=${c.transformationImage ? 'sim' : 'não'}`
    )
  }

  if (!live) {
    console.log(
      '\n🟡 DRY-RUN — nada foi escrito. Para executar: CONFIRM=RESET_ALL npx tsx scripts/reset-heroes-keep-images.ts'
    )
    return
  }

  let ok = 0
  for (const p of previews) {
    const { baseStats, attributes, derived } = p.payload
    await prisma.$transaction([
      prisma.characterInventory.deleteMany({ where: { characterId: p.id } }),
      prisma.characterEquipment.deleteMany({ where: { characterId: p.id } }),
      prisma.characterHistory.deleteMany({ where: { characterId: p.id } }),
      prisma.dungeonRun.deleteMany({ where: { characterId: p.id } }),
      prisma.gatheringSession.deleteMany({ where: { characterId: p.id } }),
      ...(RESET_PROGRESS
        ? [
            prisma.dungeonProgress.deleteMany({ where: { characterId: p.id } }),
            prisma.questProgress.deleteMany({ where: { characterId: p.id } }),
          ]
        : []),
      prisma.character.update({
        where: { id: p.id },
        data: {
          ...(RESET_ONCHAIN ? ONCHAIN_CLEAR : {}),
          level: 1,
          experience: 0,
          gold: 0,
          availablePoints: AVAILABLE_POINTS,
          inventorySlots: DEFAULT_INV_SLOTS,
          failstacks: 0,
          // Profissões zeradas junto do herói (evita sessão em campo travado por nível).
          gatherXp: 0,
          farmXp: 0,
          forgeXp: 0,
          alchemyXp: 0,
          processXp: 0,
          cookXp: 0,
          skillTree: { version: SKILL_TREE_VERSION, purchased: [] },
          baseStats,
          attributes,
          hp: derived.hp,
          maxHp: derived.hp,
          mp: derived.mp,
          maxMp: derived.mp,
          stamina: derived.stamina,
          maxStamina: derived.stamina,
          staminaUpdatedAt: new Date(),
          isAlive: true,
          deathTimestamp: null,
          isTransformed: false,
          transformationType: null,
          transformationData: null,
        },
      }),
    ])
    ok++
    console.log(`  ✓ ${p.name} resetado (seed=${p.seed})`)
  }

  await prisma.userInventory.deleteMany({})
  const uRes = await prisma.user.updateMany({
    data: { goldBalance: DEFAULT_GOLD, globalInventorySlots: DEFAULT_GLOBAL_SLOTS },
  })
  console.log(
    `\n✅ ${ok} personagens resetados | baú geral esvaziado | ${uRes.count} contas com gold=${DEFAULT_GOLD}`
  )

  // Ledgers por CONTA (não por personagem): só somem no escopo extra.
  if (RESET_ONCHAIN) {
    const [itemNfts, topups, sales, aigen] = await prisma.$transaction([
      prisma.itemNft.deleteMany({}),
      prisma.goldTopup.deleteMany({}),
      prisma.goldSale.deleteMany({}),
      prisma.aiGenPayment.deleteMany({}),
    ])
    console.log(
      `⛓️  vínculo on-chain cortado | ${itemNfts.count} ItemNft, ${topups.count} GoldTopup,` +
        ` ${sales.count} GoldSale, ${aigen.count} AiGenPayment apagados` +
        ` — re-cunhe os heróis em /dev/remint-characters`
    )
  }

  if (RESET_PROGRESS) {
    const [plots, logins] = await prisma.$transaction([
      prisma.farmPlot.deleteMany({}),
      prisma.dailyLoginClaim.deleteMany({}),
    ])
    console.log(`🗺️  progresso zerado | ${plots.count} FarmPlot, ${logins.count} DailyLoginClaim apagados`)
  }

  if (RESET_SEASON) {
    // PvpSeason cascateia entries/ratings/matches/payouts/contributions (schema.prisma).
    // Apagar em vez de marcar 'ended' faz a próxima nascer como "Temporada 1".
    const [seasons, vaults] = await prisma.$transaction([
      prisma.pvpSeason.deleteMany({}),
      prisma.prizeVault.deleteMany({}),
    ])
    console.log(
      `🏆 ${seasons.count} temporadas e ${vaults.count} cofres apagados` +
        ` — a nova nasce em PVP_SEASON_DAYS no primeiro acesso a /ranking`
    )
  }
}

main()
  .catch((e) => {
    console.error('❌ Erro:', e)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
