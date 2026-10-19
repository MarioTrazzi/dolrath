// 🛡️ Quem pode usar as ferramentas de operação/teste em produção. Mesma regra
// que o painel da temporada (api/admin/season) já usava: ids em ADMIN_USER_IDS.
export function isAdminUser(userId?: string | null): boolean {
  const admins = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return !!(userId && admins.includes(userId))
}

/**
 * Atalhos de TESTE (ex.: +XP) — liberados fora de produção, ou para admin, ou
 * com ENABLE_DEV_TOOLS=true no ambiente (servidor). Em produção, por padrão,
 * ninguém mais sobe de nível por um botão.
 */
export function devToolsAllowed(userId?: string | null): boolean {
  if (process.env.NODE_ENV !== 'production') return true
  if (process.env.ENABLE_DEV_TOOLS === 'true') return true
  return isAdminUser(userId)
}

/** O CLIENTE só mostra os botões de teste fora de produção ou com o flag público. */
export const SHOW_DEV_TOOLS =
  process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SHOW_DEV_TOOLS === 'true'
