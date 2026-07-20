// Dicionário EN→PT mesclado por domínio. Chave = texto EN canônico do código.
// Regra: chave ausente ⇒ UI mostra o EN (nunca vaza PT pro público EN).
import { COMMON_PT } from './common'
import { NAV_PT } from './nav'
import { LANDING_PT } from './landing'
import { JOURNEY_PT } from './journey'
import { LEGAL_PT } from './legal'
import { GATHERING_PT } from './gathering'
import { DASHBOARD_PT } from './dashboard'
import { CHARACTER_PT } from './character'
import { SKILLTREE_PT } from './skilltree'
import { ITEMTOOLTIP_PT } from './itemtooltip'

export const PT_DICT: Record<string, string> = {
  ...COMMON_PT,
  ...NAV_PT,
  ...LANDING_PT,
  ...JOURNEY_PT,
  ...LEGAL_PT,
  ...GATHERING_PT,
  ...DASHBOARD_PT,
  ...CHARACTER_PT,
  ...SKILLTREE_PT,
  ...ITEMTOOLTIP_PT,
}
