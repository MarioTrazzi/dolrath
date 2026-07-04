import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { freeInventorySlots } from '@/lib/inventoryMutations'

export const dynamic = 'force-dynamic'

// ⛏️ Sessões de coleta EM ABERTO de todos os personagens da conta — leitura
// pura (sem sincronizar tiques), para o dashboard e a página /gathering
// marcarem quem está trabalhando com uma chamada só. `inventoryFull` é um
// retrato rápido (sem sincronizar a sessão) para o card mostrar o alerta 🎒
// sem precisar abrir a página de coleta.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const sessions = await prisma.gatheringSession.findMany({
      where: { userId: session.user.id, status: { in: ['active', 'exhausted'] } },
      select: { characterId: true, fieldId: true, status: true, startedAt: true },
    })
    const withInventory = await Promise.all(
      sessions.map(async (s) => {
        const { free } = await freeInventorySlots(prisma, s.characterId)
        return { ...s, inventoryFull: free <= 0 }
      })
    )
    return NextResponse.json({ sessions: withInventory })
  } catch (error) {
    console.error('Error listing gathering sessions:', error)
    return NextResponse.json({ error: 'Failed to list gathering sessions' }, { status: 500 })
  }
}
