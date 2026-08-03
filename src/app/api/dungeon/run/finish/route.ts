import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getDungeon, flushRunRewards, type RunEndReason } from '@/lib/dungeonRunServer'

export const dynamic = 'force-dynamic'

// 🏁 Encerra a run e credita TUDO de uma vez.
//
// Este é o único ponto pesado do loop da masmorra: o que antes era uma transação
// gorda por nó (catálogo por nome, contagem de slots e teto diário repetidos a
// cada luta) virou UMA transação por run. Durante a run o cliente só acumula; o
// banco só é tocado aqui.
//
// Corpo: { runId, reason, resolve?, hpPct?, mpPct? }
//   • reason 'boss'    → chefe caiu: run 'finished' (destrava o tier seguinte).
//   • reason 'retreat' → recuo/saída: run 'abandoned'.
//   • reason 'lose'    → derrota: run 'defeated'.
//   • resolve          → desfecho do ÚLTIMO nó (o que não teve /step seguinte
//                        para levá-lo de carona): { nodeIdx, outcome, killedIds }.
//   • hpPct/mpPct      → fração (0..1) dos pools com que o herói saiu. HP/MP
//                        SOBREVIVEM à run: voltar ao cheio é serviço pago da
//                        Alquimista (/api/character/[id]/restore).
//
// Idempotente: só roda com a run 'active'. Um reenvio encontra a run já fechada
// e volta 409 — que o cliente trata como sucesso (o crédito já aconteceu).
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { runId, reason, resolve, hpPct, mpPct } = await req.json()
    const VALID: RunEndReason[] = ['boss', 'retreat', 'lose']
    if (!runId || !VALID.includes(reason)) {
      return NextResponse.json({ error: 'runId e reason (boss|retreat|lose) são obrigatórios' }, { status: 400 })
    }
    // ❤️ Fração de HP/MP com que o herói saiu (0..1). Ausente/inválida = não
    // mexe nos pools (o flushRunRewards trata como "sem informação").
    const pct = (v: unknown) =>
      typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : undefined

    const run = await prisma.dungeonRun.findFirst({ where: { id: runId, userId } })
    if (!run) return NextResponse.json({ error: 'Run não encontrada' }, { status: 404 })
    if (run.status !== 'active') {
      return NextResponse.json({ error: 'Run já encerrada', status: run.status }, { status: 409 })
    }

    const dungeon = getDungeon(run.dungeonId)
    if (!dungeon) return NextResponse.json({ error: 'Masmorra inválida' }, { status: 500 })

    const granted = await flushRunRewards(run, { reason, resolve, hpPct: pct(hpPct), mpPct: pct(mpPct) })
    if (!granted) return NextResponse.json({ error: 'Run já encerrada', status: 'unknown' }, { status: 409 })

    return NextResponse.json({ finished: true, ...granted })
  } catch (error) {
    console.error('Error finishing dungeon run:', error)
    return NextResponse.json({ error: 'Failed to finish dungeon run' }, { status: 500 })
  }
}
