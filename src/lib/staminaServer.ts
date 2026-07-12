import { prisma } from '@/lib/prisma'
import { computeStaminaRegen } from '@/lib/staminaSystem'
import { syncGatheringSession } from '@/lib/gatheringServer'

type StaminaFields = { id: string; stamina: number; maxStamina: number; staminaUpdatedAt: Date }

/**
 * Sessão de coleta viva anexada ao personagem pelos caminhos de leitura.
 * O cliente usa `status === 'active'` para trocar o tick visual de regen
 * (+2/15min) pelo de coleta (−3/15min a partir de `lastTickAt`).
 */
export interface LiveGatheringInfo {
  fieldId: string
  status: string
  lastTickAt: Date
  /** Inventário sem slot: coleta pausada, stamina congelada até liberar espaço. */
  inventoryFull: boolean
}

/**
 * Sincroniza a stamina de um personagem JÁ carregado e PERSISTE a mudança.
 * Use em qualquer caminho de LEITURA (ex.: /api/character/me) ou antes de
 * COBRAR stamina: o valor retornado é a stamina viva, fonte da verdade.
 *
 * ⛏️ COLETA inverte o relógio: enquanto há uma GatheringSession ATIVA o
 * personagem está trabalhando — cada tique de coleta DEBITA stamina e o regen
 * passivo fica suspenso. Antes deste sync centralizado, os tiques só eram
 * computados quando a página de coleta chamava /api/gather/status, então
 * navbar/dashboard mostravam a stamina congelada (ou subindo, pelo regen
 * fantasma). Agora QUALQUER leitura resolve o relógio certo:
 *  - sessão ativa  → syncGatheringSession (debita tiques, persiste, anexa
 *    `gathering` para a UI mostrar o decréscimo ao vivo);
 *  - sem sessão    → regen passivo (+2/15min) persistido se houve ganho.
 */
export async function regenAndPersist<T extends StaminaFields>(
  character: T
): Promise<T & { gathering?: LiveGatheringInfo }> {
  const session = await prisma.gatheringSession.findFirst({
    where: { characterId: character.id, status: 'active' },
  })

  if (session) {
    const synced = await syncGatheringSession(session)
    return {
      ...character,
      stamina: synced.stamina,
      // Durante a coleta, staminaUpdatedAt anda junto com lastTickAt (ambos
      // gravados no tique) — refletimos a âncora pós-sync no objeto retornado.
      staminaUpdatedAt: synced.session.lastTickAt,
      gathering: {
        fieldId: synced.session.fieldId,
        status: synced.session.status,
        lastTickAt: synced.session.lastTickAt,
        inventoryFull: synced.inventoryFull,
      },
    }
  }

  const { stamina, staminaUpdatedAt, gained } = computeStaminaRegen(character)
  if (gained <= 0) return character
  await prisma.character.update({
    where: { id: character.id },
    data: { stamina, staminaUpdatedAt },
  })
  return { ...character, stamina, staminaUpdatedAt }
}
