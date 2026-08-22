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
import { INVENTORY_PT } from './inventory'
import { REPAIRBENCH_PT } from './repairbench'
import { SHOP_PT } from './shop'
import { ENHANCEMENT_PT } from './enhancement'
import { RANKING_PT } from './ranking'
import { FORGE_PT } from './forge'
import { COOKING_PT } from './cooking'
import { ALCHEMY_PT } from './alchemy'
import { PROCESSING_PT } from './processing'
import { DUNGEONSMAP_PT } from './dungeonsmap'
import { FARM_PT } from './farm'
import { QUESTS_PT } from './quests'
import { DUNGEON_PT } from './dungeon'
import { PVP_PT } from './pvp'
import { MARKET_PT } from './market'
import { CREATION_PT } from './creation'
import { WALLET_PT } from './wallet'
import { API_PT } from './api'
import { DOC_PT } from './doc'

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
  ...INVENTORY_PT,
  ...REPAIRBENCH_PT,
  ...SHOP_PT,
  ...ENHANCEMENT_PT,
  ...RANKING_PT,
  ...FORGE_PT,
  ...COOKING_PT,
  ...ALCHEMY_PT,
  ...PROCESSING_PT,
  ...DUNGEONSMAP_PT,
  ...FARM_PT,
  ...QUESTS_PT,
  ...DUNGEON_PT,
  ...PVP_PT,
  ...MARKET_PT,
  ...CREATION_PT,
  ...WALLET_PT,
  ...API_PT,
  ...DOC_PT,
}
