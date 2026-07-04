import { prisma } from '@/lib/prisma'
import { computeStaminaRegen } from '@/lib/staminaSystem'

type StaminaFields = { id: string; stamina: number; maxStamina: number; staminaUpdatedAt: Date }

/**
 * Aplica o regen passivo a um personagem JÁ carregado e PERSISTE se houve ganho.
 * Use no caminho de LEITURA (ex.: /api/character/me) para que a stamina mostrada
 * — e a âncora salva — fiquem sempre vivas. Retorna o objeto com os campos de
 * stamina atualizados (mantém os demais campos intactos).
 *
 * ⛏️ COLETA suspende o regen: enquanto o personagem tem uma GatheringSession
 * ATIVA ele está trabalhando (cada tique de coleta debita stamina), não
 * descansando. Sem este guard, chamadas de leitura creditariam +2/15min em
 * paralelo aos tiques e a sessão renderia ~3× mais do que o desenhado.
 * O relógio da sessão (gatheringServer.syncGatheringSession) é a autoridade
 * da stamina nesse período; o regen volta quando a sessão esgota/encerra.
 */
export async function regenAndPersist<T extends StaminaFields>(character: T): Promise<T> {
  const { stamina, staminaUpdatedAt, gained } = computeStaminaRegen(character)
  if (gained <= 0) return character
  const gathering = await prisma.gatheringSession.findFirst({
    where: { characterId: character.id, status: 'active' },
    select: { id: true },
  })
  if (gathering) return character
  await prisma.character.update({
    where: { id: character.id },
    data: { stamina, staminaUpdatedAt },
  })
  return { ...character, stamina, staminaUpdatedAt }
}
