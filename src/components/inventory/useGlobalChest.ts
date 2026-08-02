'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { sellUnitPrice as sellPrice } from '@/lib/sellPricing'
import { getWalletTxErrorMessage } from '@/lib/walletErrors'
import { payGoldOnChain, confirmExpansion } from '@/lib/goldSpendClient'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { localizeItemName } from '@/lib/i18n/catalog'

// 🌐 Baú Geral — estado e ações do inventário GLOBAL da conta (UserInventory,
// empilhado por itemId), incluindo a transferência nos dois sentidos com o
// inventário do personagem. Vive num hook porque o baú é montado na ficha do
// herói (/character/[id]), ao lado do inventário dele: as duas metades precisam
// se atualizar juntas depois de cada transferência.

// Baú Geral começa com 50 espaços (User.globalInventorySlots), expansível como o do personagem.
const GLOBAL_SLOTS_DEFAULT = 50
// Expansão (espelha o personagem): +5 slots por 1000 GOLD.
export const EXPAND_SLOTS = 5
export const EXPAND_COST_GOLD = 1000

export interface ChestItem {
  id: string
  name: string
  type: string
  stats: any
  description?: string
  image?: string | null
  level?: number
  goldPrice?: number
}

export interface ChestRow {
  id: string
  quantity: number
  item: ChestItem
}

export interface TransferTarget {
  item: ChestItem
  maxQuantity: number
  destination: 'character' | 'global'
}

export interface UseGlobalChestOptions {
  /** Herói dono da outra metade da transferência (vazio = nenhum ativo). */
  characterId: string
  /** Chamado sempre que o inventário do PERSONAGEM muda (transferências). */
  onCharacterInventoryChanged?: () => void
}

export function useGlobalChest({ characterId, onCharacterInventoryChanged }: UseGlobalChestOptions) {
  const { locale, t } = useI18n()

  const [items, setItems] = useState<ChestRow[]>([])
  // Slots do Baú Geral (User.globalInventorySlots).
  const [slots, setSlots] = useState<number>(GLOBAL_SLOTS_DEFAULT)
  // Saldo GOLD on-chain: o Baú Geral representa a carteira do jogador, então a
  // barra de moedas dele mostra o token GOLD de verdade (mintado via claim).
  const [onchainGold, setOnchainGold] = useState<string | null>(null)
  const [expanding, setExpanding] = useState(false)
  const [busy, setBusy] = useState(false)
  // Diálogo de quantidade ao arrastar uma pilha (>1) entre inventários.
  const [transferTarget, setTransferTarget] = useState<TransferTarget | null>(null)

  const refreshItems = useCallback(async () => {
    try {
      const res = await fetch('/api/inventory/user')
      if (res.ok) setItems(await res.json())
    } catch (error) {
      console.error('Error fetching user inventory:', error)
    }
  }, [])

  const refreshBank = useCallback(async () => {
    try {
      const res = await fetch('/api/bank/status')
      if (res.ok) {
        const data = await res.json()
        setSlots(Number(data?.globalInventorySlots ?? GLOBAL_SLOTS_DEFAULT))
      }
    } catch (error) {
      console.error('Error fetching bank status:', error)
    }
  }, [])

  const refreshOnchainGold = useCallback(async () => {
    try {
      const res = await fetch('/api/wallet/gold-balance', { cache: 'no-store' })
      if (res.ok) {
        const data = await res.json()
        const n = Number(data?.formatted)
        setOnchainGold(data?.walletLinked && Number.isFinite(n) ? n.toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US') : null)
      }
    } catch (error) {
      console.error('Error fetching on-chain gold:', error)
    }
  }, [locale])

  const refresh = useCallback(() => {
    refreshItems()
    refreshBank()
    refreshOnchainGold()
  }, [refreshItems, refreshBank, refreshOnchainGold])

  useEffect(() => { refresh() }, [refresh])

  // Baú Geral → personagem.
  const transferToCharacter = useCallback(async (itemId: string, quantity: number = 1) => {
    if (!characterId) {
      toast.error(t('⚠️ Select a character first'), { duration: 3000 })
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/character/${characterId}/transfer-item`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantity }),
      })
      if (res.ok) {
        refreshItems()
        onCharacterInventoryChanged?.()
        toast.success(
          quantity > 1
            ? t('📦 {n}x transferred to the character!', { n: quantity })
            : t('📦 Item transferred to the character!'),
          { duration: 3000 }
        )
      } else {
        const error = await res.json().catch(() => null)
        toast.error(t('❌ Transfer error: {error}', { error: error?.error }), { duration: 4000 })
      }
    } catch (error) {
      console.error('Error transferring item:', error)
      toast.error(t('💥 Unexpected transfer error'), { duration: 4000 })
    }
    setBusy(false)
  }, [characterId, t, refreshItems, onCharacterInventoryChanged])

  // Personagem → Baú Geral. A rota recusa peça equipada, aprimorada (+N) ou
  // desgastada: o baú empilha por itemId e não guarda esse estado.
  const transferToGlobal = useCallback(async (itemId: string, quantity: number = 1) => {
    if (!characterId) {
      toast.error(t('⚠️ Select a character first'), { duration: 3000 })
      return
    }
    setBusy(true)
    try {
      const res = await fetch(`/api/character/${characterId}/transfer-to-global`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, quantity }),
      })
      if (res.ok) {
        refreshItems()
        onCharacterInventoryChanged?.()
        toast.success(
          quantity > 1
            ? t('🌐 {n}x transferred to the global inventory!', { n: quantity })
            : t('🌐 Item transferred to the global inventory!'),
          { duration: 3000 }
        )
      } else {
        const error = await res.json().catch(() => null)
        toast.error(t('❌ Transfer error: {error}', { error: error?.error }), { duration: 4000 })
      }
    } catch (error) {
      console.error('Error transferring item to global:', error)
      toast.error(t('💥 Unexpected transfer error'), { duration: 4000 })
    }
    setBusy(false)
  }, [characterId, t, refreshItems, onCharacterInventoryChanged])

  // 🔥 Vender ao ferreiro (burn) a partir do BAÚ GERAL: destrói a peça por metade
  // do preço; o gold vai pro BANCO da conta (User.goldBalance).
  const sellFromGlobal = useCallback(async (inventoryId: string, quantity: number = 1) => {
    const row = items.find((i) => i.id === inventoryId)
    const name = row?.item?.name ? localizeItemName(row.item.name, locale) : t('item')
    const unitPrice = row?.item ? sellPrice(row.item as any) : 0 // sellPricing (fonte única)
    const total = unitPrice * quantity
    const label = quantity > 1 ? `${quantity}x ${name}` : name
    if (!window.confirm(t('Sell {label} to the blacksmith for {total} gold?\nThe gold goes to the bank. The item will be destroyed (cannot be undone).', { label, total }))) return

    setBusy(true)
    try {
      const res = await fetch('/api/inventory/sell-item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inventoryId, quantity }),
      })
      if (res.ok) {
        const data = await res.json()
        refreshItems()
        refreshBank()
        toast.success(data?.message ?? t('💰 Sold for {total} gold!', { total }), { duration: 3000 })
      } else {
        const error = await res.json().catch(() => null)
        toast.error(`❌ ${error?.error ?? t('Failed to sell')}`, { duration: 4000 })
      }
    } catch (error) {
      console.error('Error selling global item:', error)
      toast.error(t('💥 Unexpected error selling'), { duration: 4000 })
    }
    setBusy(false)
  }, [items, locale, t, refreshItems, refreshBank])

  const expand = useCallback(async () => {
    setExpanding(true)
    try {
      // 1) Tenta pagar OFF-CHAIN com o GOLD do banco/Baú Geral (sem txHash).
      let response: Response | null = await fetch('/api/user/expand-global-inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slots: EXPAND_SLOTS }),
      })

      // 2) Sem GOLD no banco → cai pro fluxo ON-CHAIN (compra pela carteira).
      if (response.status === 402) {
        const info = await response.json().catch(() => null)
        if (info?.requiresPayment) {
          toast(t('💰 No GOLD in the bank — paying on-chain via wallet…'))
          const payment = await payGoldOnChain(EXPAND_COST_GOLD)
          if (!payment.ok) {
            if (payment.reason === 'no-wallet') toast.error(t('MetaMask not found'))
            else if (payment.reason === 'wrong-chain') toast.error(t('Switch to chainId {chainId} in MetaMask', { chainId: payment.chainId }))
            else toast.error(t('💰 Insufficient GOLD on-chain! You need {n} GOLD.', { n: payment.needed }))
            return
          }
          toast.success(t('Payment sent! Awaiting confirmation…'))
          response = await confirmExpansion('/api/user/expand-global-inventory', EXPAND_SLOTS, payment.txHash)
        }
      }

      if (response?.ok) {
        const data = await response.json().catch(() => null)
        if (typeof data?.globalInventorySlots === 'number') setSlots(data.globalInventorySlots)
        // Re-sincroniza o saldo do banco (mudou se pagou off-chain).
        refreshBank()
        toast.success(t('🌐 +{n} slots in the Global Chest! ({cost} GOLD)', { n: EXPAND_SLOTS, cost: EXPAND_COST_GOLD }))
      } else {
        const error = await response?.json().catch(() => null)
        toast.error(`❌ ${error?.error || t('Failed to confirm expansion')}`)
      }
    } catch (error) {
      console.error('Error expanding global inventory:', error)
      toast.error(getWalletTxErrorMessage(error, t('💥 Unexpected error expanding the Global Chest')))
    } finally {
      setExpanding(false)
    }
  }, [t, refreshBank])

  // 🔀 Drag & drop entre inventários. O item arrastado carrega a quantidade
  // disponível na pilha de origem; pilhas (>1) abrem o diálogo de quantidade,
  // itens únicos (equipamento) transferem direto.
  const dropToCharacter = useCallback((item: ChestItem, availableQuantity: number) => {
    if (!characterId) {
      toast.error(t('⚠️ Select a character first'), { duration: 3000 })
      return
    }
    if (availableQuantity > 1) setTransferTarget({ item, maxQuantity: availableQuantity, destination: 'character' })
    else transferToCharacter(item.id, 1)
  }, [characterId, t, transferToCharacter])

  const dropToGlobal = useCallback((item: ChestItem, availableQuantity: number) => {
    if (availableQuantity > 1) setTransferTarget({ item, maxQuantity: availableQuantity, destination: 'global' })
    else transferToGlobal(item.id, 1)
  }, [transferToGlobal])

  // Clique no botão de transferir do card: pilha > 1 abre o mesmo diálogo de
  // quantidade do drag & drop, em vez de mandar sempre 1.
  const requestTransferToCharacter = useCallback((itemId: string, quantity: number = 1) => {
    if (quantity > 1) {
      const row = items.find((i) => i.item.id === itemId)
      if (row) {
        setTransferTarget({ item: row.item, maxQuantity: quantity, destination: 'character' })
        return
      }
    }
    transferToCharacter(itemId, 1)
  }, [items, transferToCharacter])

  const confirmTransfer = useCallback((quantity: number) => {
    if (!transferTarget) return
    if (transferTarget.destination === 'character') transferToCharacter(transferTarget.item.id, quantity)
    else transferToGlobal(transferTarget.item.id, quantity)
    setTransferTarget(null)
  }, [transferTarget, transferToCharacter, transferToGlobal])

  return {
    items,
    slots,
    onchainGold,
    expanding,
    busy,
    transferTarget,
    refresh,
    refreshBank,
    refreshOnchainGold,
    transferToCharacter,
    transferToGlobal,
    requestTransferToCharacter,
    sellFromGlobal,
    expand,
    dropToCharacter,
    dropToGlobal,
    confirmTransfer,
    closeTransfer: () => setTransferTarget(null),
  }
}
