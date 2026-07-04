import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { regenAndPersist } from '@/lib/staminaServer'
import { spendFarmActionStaminaTx } from '@/lib/farmServer'
import { getCropById } from '@/lib/farming'
import { farmPlotCount, getProfessionLevel } from '@/lib/professionSystem'
import { isSeedItem } from '@/lib/itemCatalog'

export const dynamic = 'force-dynamic'

// 🌾 Planta uma semente num canteiro vazio. Consome 1 semente do inventário +
// stamina da ação; o crescimento corre sozinho (lazy, por timestamp).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { characterId, slotIndex, cropId } = await req.json()
    const slot = Number(slotIndex)
    if (!characterId || !Number.isInteger(slot) || !cropId) {
      return NextResponse.json({ error: 'characterId, slotIndex e cropId são obrigatórios' }, { status: 400 })
    }

    const crop = getCropById(String(cropId))
    if (!crop) {
      return NextResponse.json({ error: 'Cultivo inválido' }, { status: 400 })
    }

    const rawCharacter = await prisma.character.findFirst({ where: { id: characterId, userId } })
    if (!rawCharacter) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }
    const character = await regenAndPersist(rawCharacter)

    const unlocked = farmPlotCount(getProfessionLevel(character.farmXp))
    if (slot < 0 || slot >= unlocked) {
      return NextResponse.json({ error: `Canteiro bloqueado (você tem ${unlocked}).` }, { status: 403 })
    }

    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.farmPlot.findUnique({
        where: { characterId_slotIndex: { characterId, slotIndex: slot } },
      })
      if (existing?.plantedAt) {
        throw new Error('Este canteiro já está plantado.')
      }

      // Consome 1 semente (linhas CONSUMABLE do nome, classificadas pelo catálogo).
      const rows = await tx.characterInventory.findMany({
        where: { characterId, item: { name: crop.seedName, type: 'CONSUMABLE' } },
        include: { item: true },
        orderBy: { quantity: 'desc' },
      })
      const seedRow = rows.find((r) => isSeedItem(r.item) && r.quantity > 0)
      if (!seedRow) {
        throw new Error(`Você não tem ${crop.seedName}. Sementes caem coletando nos Campos de Ervas.`)
      }
      if (seedRow.quantity > 1) {
        await tx.characterInventory.update({ where: { id: seedRow.id }, data: { quantity: { decrement: 1 } } })
      } else {
        await tx.characterInventory.delete({ where: { id: seedRow.id } })
      }

      const stamina = await spendFarmActionStaminaTx(tx, characterId)

      const now = new Date()
      const plot = existing
        ? await tx.farmPlot.update({
            where: { id: existing.id },
            data: { kind: 'crop', cropId: crop.id, plantedAt: now, state: 'growing' },
          })
        : await tx.farmPlot.create({
            data: { characterId, slotIndex: slot, kind: 'crop', cropId: crop.id, plantedAt: now, state: 'growing' },
          })
      return { plot, stamina }
    })

    return NextResponse.json({
      slotIndex: slot,
      cropId: crop.id,
      plantedAt: result.plot.plantedAt,
      stamina: result.stamina,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Erro interno do servidor'
    const isValidation = /insuficiente|não tem|já está|bloqueado/i.test(message)
    if (!isValidation) console.error('Error planting crop:', error)
    return NextResponse.json({ error: message }, { status: isValidation ? 400 : 500 })
  }
}
