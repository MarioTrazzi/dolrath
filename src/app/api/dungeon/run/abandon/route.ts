import { NextResponse } from 'next/server'
import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Encerra a run ativa (ao sair da masmorra). Recompensas já foram creditadas
// por nó/abate; não há nada a "salvar" aqui — só fecha a sessão.
// Aceita sessão humana ou frota (x-bot-secret) para bots abandonarem e irem ao PvP.
export async function POST(req: Request) {
  const resolved = await requireApiActor(req)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId

  try {
    const body = await req.json()
    const runId = body.runId as string | undefined
    const characterId = body.characterId as string | undefined

    if (runId) {
      await prisma.dungeonRun.updateMany({
        where: { id: runId, userId, status: 'active' },
        data: { status: 'abandoned' },
      })
      return NextResponse.json({ success: true })
    }

    // Atalho da frota: abandona qualquer run ativa deste herói.
    if (characterId) {
      const owned = await prisma.character.findFirst({
        where: { id: characterId, userId },
        select: { id: true },
      })
      if (!owned) return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
      const res = await prisma.dungeonRun.updateMany({
        where: { characterId, userId, status: 'active' },
        data: { status: 'abandoned' },
      })
      return NextResponse.json({ success: true, abandoned: res.count })
    }

    return NextResponse.json({ error: 'runId ou characterId é obrigatório' }, { status: 400 })
  } catch (error) {
    console.error('Error abandoning dungeon run:', error)
    return NextResponse.json({ error: 'Failed to abandon run' }, { status: 500 })
  }
}
