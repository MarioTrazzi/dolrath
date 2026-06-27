import { prisma } from '@/lib/prisma'
import { computeStaminaRegen } from '@/lib/staminaSystem'

type StaminaFields = { id: string; stamina: number; maxStamina: number; staminaUpdatedAt: Date }

/**
 * Aplica o regen passivo a um personagem JÁ carregado e PERSISTE se houve ganho.
 * Use no caminho de LEITURA (ex.: /api/character/me) para que a stamina mostrada
 * — e a âncora salva — fiquem sempre vivas. Retorna o objeto com os campos de
 * stamina atualizados (mantém os demais campos intactos).
 */
export async function regenAndPersist<T extends StaminaFields>(character: T): Promise<T> {
  const { stamina, staminaUpdatedAt, gained } = computeStaminaRegen(character)
  if (gained <= 0) return character
  await prisma.character.update({
    where: { id: character.id },
    data: { stamina, staminaUpdatedAt },
  })
  return { ...character, stamina, staminaUpdatedAt }
}
