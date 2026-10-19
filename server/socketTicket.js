// 🎟️ Conferência do ingresso da arena (par de src/lib/socketTicket.ts — o formato tem
// de ser o MESMO dos dois lados). Sem banco: só a assinatura, o herói e o prazo.
const crypto = require('crypto')

const PREFIX = 'dolrath-socket-ticket.v1.'

function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/**
 * Devolve { ok: true, userId } quando o ingresso é válido PARA ESTE herói; senão
 * { ok: false, reason }. Sem BATTLE_REWARDS_SECRET (dev local) não há o que conferir
 * e a resposta é { ok: true, skipped: true } — o mesmo segredo que, ausente, já
 * desliga as recompensas.
 */
function verifySocketTicket(ticket, characterId) {
  const secret = process.env.BATTLE_REWARDS_SECRET
  if (!secret) return { ok: true, skipped: true }
  if (typeof ticket !== 'string' || !ticket.includes('.')) return { ok: false, reason: 'missing' }
  const [payload, sig] = ticket.split('.')
  const expected = b64url(crypto.createHmac('sha256', secret).update(PREFIX + payload).digest())
  const a = Buffer.from(String(sig || ''))
  const b = Buffer.from(expected)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: 'bad_signature' }
  let data
  try {
    data = JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'))
  } catch {
    return { ok: false, reason: 'bad_payload' }
  }
  if (!data || data.cid !== characterId) return { ok: false, reason: 'wrong_character' }
  if (!Number.isFinite(data.exp) || data.exp * 1000 < Date.now()) return { ok: false, reason: 'expired' }
  return { ok: true, userId: data.uid }
}

module.exports = { verifySocketTicket }
