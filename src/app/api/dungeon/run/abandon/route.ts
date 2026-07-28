import { NextResponse } from 'next/server'
import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { flushRunRewards, flushStaleRuns } from '@/lib/dungeonRunServer'

export const dynamic = 'force-dynamic'

// Encerra a run ativa (ao sair da masmorra). O crédito da run acontece no
// /finish, então aqui não basta marcar 'abandoned': o espólio acumulado precisa
// ser DRENADO antes, senão sair por este caminho jogaria a run fora.
// (A saída normal do jogador passa por /finish; isto cobre bots e sobras.)
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
      const run = await prisma.dungeonRun.findFirst({
        where: { id: runId, userId, status: 'active' },
        select: {
          id: true, userId: true, characterId: true, dungeonId: true,
          tier: true, cursor: true, pending: true, accrued: true,
        },
      })
      if (run) {
        const granted = await flushRunRewards(run, { reason: 'retreat' })
        // Flush que não fecha a run (masmorra/personagem sumiu) não pode deixá-la
        // 'active' — isso seguraria o lock do herói na próxima entrada.
        if (!granted) {
          await prisma.dungeonRun.updateMany({
            where: { id: runId, userId, status: 'active' },
            data: { status: 'abandoned' },
          })
        }
      }
      return NextResponse.json({ success: true })
    }

    // Atalho da frota: abandona qualquer run ativa deste herói.
    if (characterId) {
      const owned = await prisma.character.findFirst({
        where: { id: characterId, userId },
        select: { id: true },
      })
      if (!owned) return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
      await flushStaleRuns({ userId, characterId })
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'runId ou characterId é obrigatório' }, { status: 400 })
  } catch (error) {
    console.error('Error abandoning dungeon run:', error)
    return NextResponse.json({ error: 'Failed to abandon run' }, { status: 500 })
  }
}
