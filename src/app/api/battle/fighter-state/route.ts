// ⚡ ESTADO VIVO DO LUTADOR — a janela do socket para o banco.
//
// 🔒 SERVICE-ONLY, mesmo segredo de /api/battle/rewards. O server/socket-server.js roda
// num processo separado (Render) e NÃO tem Prisma: até aqui, o `player.stamina` da luta
// vinha do payload do cliente, onde `stamina: 100` era literal — o lobby caía em
// `details.stamina || 100`, que ainda transformava um herói ZERADO em tanque cheio.
//
// Com isto o orçamento da luta passa a ser o do banco. Continua sendo LEITURA, não
// reserva: reservar exigiria varrer sobras toda vez que o processo do socket caísse ou
// a luta morresse sem `combat_end`, e o socket não tem banco para varrer. Quem cobra é
// a rota de recompensas, no fim, como já era.
import { prisma } from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'
import { regenAndPersist } from '@/lib/staminaServer'
import { PVP_FIGHT_STAMINA } from '@/lib/pvpRewards'

/** Ids que o SERVIDOR gera para lutadores sintéticos — não existem no banco. */
const VIRTUAL_PREFIXES = ['bot_', 'monster_']

function isVirtualFighter(id: string): boolean {
  return typeof id === 'string' && VIRTUAL_PREFIXES.some((p) => id.startsWith(p))
}

function isServiceCall(request: NextRequest): boolean {
  const secret = process.env.BATTLE_REWARDS_SECRET
  if (!secret) {
    // Mesma postura da rota de recompensas: sem o segredo nada responde. Falhar alto
    // é melhor que devolver um estado que ninguém autenticou.
    console.error('⚠️ BATTLE_REWARDS_SECRET não configurado — fighter-state desativada!')
    return false
  }
  return request.headers.get('x-battle-secret') === secret
}

/** Teto de ids por chamada: o join pede 1, a reconciliação de consumível pede 1. */
const MAX_IDS = 4

export async function POST(request: NextRequest) {
  if (!isServiceCall(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const rawIds: unknown = body?.characterIds
    if (!Array.isArray(rawIds) || rawIds.length === 0) {
      return NextResponse.json({ error: 'characterIds obrigatório' }, { status: 400 })
    }

    const ids = Array.from(new Set(rawIds.filter((id): id is string => typeof id === 'string' && !!id))).slice(0, MAX_IDS)

    const fighters = await Promise.all(
      ids.map(async (id) => {
        // Lutador sintético: a stamina dele é do jogo, não do banco. Devolver `virtual`
        // deixa o socket pular o portão de entrada sem inventar número nenhum.
        if (isVirtualFighter(id)) return { id, virtual: true as const }

        const character = await prisma.character.findUnique({
          where: { id },
          select: { id: true, level: true, stamina: true, maxStamina: true, staminaUpdatedAt: true },
        })
        if (!character) return null

        // 🕐 O relógio ÚNICO. Nunca computeStaminaRegen direto: se o herói está numa
        // sessão de coleta, este caminho DEBITA os tiques em vez de aplicar o regen
        // passivo — e é justamente essa a stamina que a luta vai gastar.
        const live = await regenAndPersist(character)

        return {
          id: character.id,
          level: character.level,
          stamina: live.stamina,
          maxStamina: character.maxStamina,
          // ⛏️ Coletando: o relógio está correndo PARA TRÁS. Entrar na arena assim faz
          // a coleta comer a stamina que a luta vai cobrar, e os dois lados recebem
          // menos (o pool é a soma). O socket recusa a entrada.
          gathering: !!live.gathering,
          virtual: false as const,
        }
      })
    )

    return NextResponse.json({
      // O socket aprende a taxa aqui, na mesma resposta que traz a stamina — evita um
      // espelho JS de uma constante só, que inevitavelmente sairia de sincronia.
      // 🎟️ Agora é a taxa FIXA da luta (não mais um piso): quem não tem os 19⚡
      // inteiros não entra, porque a rota de recompensas vai cobrar exatamente isso.
      entryStamina: PVP_FIGHT_STAMINA,
      // Nome legado do mesmo número — um socket ainda não redeployado lê este campo.
      minEntryStamina: PVP_FIGHT_STAMINA,
      fighters: fighters.filter((f) => f !== null),
    })
  } catch (error) {
    console.error('fighter-state error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
