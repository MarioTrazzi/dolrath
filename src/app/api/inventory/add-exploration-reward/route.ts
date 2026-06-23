import { auth } from '@/app/api/auth/[...nextauth]/route'
import { NextResponse } from 'next/server'

// 🔒 DESATIVADA (fail-closed). Esta rota creditava `gold` (e itens) a partir do
// CORPO da requisição — o cliente decidia a recompensa. Era o principal vetor de
// mint arbitrário do faucet (POST { gold: 1e9 } caía direto no goldBalance
// claimável). As recompensas da masmorra agora são SERVIDOR-AUTORITATIVAS via
// /api/dungeon/run/{start,step,combat}. Mantida só para retornar 410 a qualquer
// chamador legado e garantir que nenhum gold seja creditado pelo cliente.
export async function POST() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  return NextResponse.json(
    {
      error:
        'Endpoint desativado. As recompensas de masmorra são creditadas pelo servidor em /api/dungeon/run/step e /api/dungeon/run/combat.',
      deprecated: true,
    },
    { status: 410 }
  )
}
