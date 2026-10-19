// 🎟️ Ingresso da arena — prova, para o socket (server/socket-server.js, outro processo
// e outro domínio, sem sessão NextAuth), que quem entra como lutador é DONO do herói.
//
// Até aqui o join_room aceitava qualquer `player.id`: dava para sentar como o herói de
// outra conta, perder de propósito para um alt e embolsar ouro/pontos com a stamina da
// vítima. O ingresso é um HMAC curto ({ characterId, userId, exp }) assinado com o mesmo
// segredo que o socket já usa para falar com /api/battle/*; o socket confere a
// assinatura (server/socketTicket.js) sem precisar de banco.
//
// Formato: base64url(JSON).base64url(HMAC-SHA256(secret, "dolrath-socket-ticket.v1." + payload))
import crypto from 'crypto'

const PREFIX = 'dolrath-socket-ticket.v1.'
export const SOCKET_TICKET_TTL_SEC = 15 * 60

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function signSocketTicket(
  input: { characterId: string; userId: string },
  ttlSec = SOCKET_TICKET_TTL_SEC,
): string | null {
  const secret = process.env.BATTLE_REWARDS_SECRET
  if (!secret) return null
  const payload = b64url(
    JSON.stringify({ cid: input.characterId, uid: input.userId, exp: Math.floor(Date.now() / 1000) + ttlSec }),
  )
  const sig = b64url(crypto.createHmac('sha256', secret).update(PREFIX + payload).digest())
  return `${payload}.${sig}`
}
