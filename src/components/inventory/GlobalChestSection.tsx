'use client'

// 🌐 BAÚ GERAL — inventário da CONTA, montado logo abaixo do inventário do herói
// na ficha (/character/[id]). Ficar lado a lado é o ponto: o jogador arrasta a
// peça do herói pro baú (e vice-versa) sem trocar de página. Em cima vem o
// BankPanel, que é o claim de GOLD (o baú representa a carteira on-chain).
//
// Puramente apresentacional: todo o estado e as ações vêm do useGlobalChest.

import InventoryPanel from '@/components/inventory/InventoryPanel'
import BankPanel from '@/components/inventory/BankPanel'
import TransferQuantityDialog from '@/components/inventory/TransferQuantityDialog'
import { useI18n } from '@/lib/i18n/I18nProvider'
import { EXPAND_SLOTS, EXPAND_COST_GOLD, type useGlobalChest } from '@/components/inventory/useGlobalChest'

interface GlobalChestSectionProps {
  chest: ReturnType<typeof useGlobalChest>
  characterId: string
  /** Nome do herói — rótulo do destino no diálogo de quantidade. */
  characterName?: string | null
  /** Cor de destaque do painel do herói, usada no diálogo de transferência. */
  characterAccent?: string
}

export default function GlobalChestSection({
  chest,
  characterId,
  characterName,
  characterAccent = '#d9a441',
}: GlobalChestSectionProps) {
  const { t } = useI18n()

  return (
    <div className="w-full">
      {/* ⛓️ Claim de GOLD: bolso do herói → token on-chain na carteira */}
      <BankPanel
        characterId={characterId || null}
        onChanged={() => { chest.refreshBank(); chest.refreshOnchainGold() }}
      />

      <InventoryPanel
        title={t('Global Chest')}
        items={chest.items as any}
        totalSlots={chest.slots}
        accent="#3b82f6"
        characterId={characterId}
        slotLabel={t('Chest Slots')}
        onTransfer={chest.requestTransferToCharacter}
        onSell={chest.sellFromGlobal}
        onExpand={chest.expand}
        expanding={chest.expanding}
        expandTitle={t('Expand +{n} slots (cost: {cost} GOLD)', { n: EXPAND_SLOTS, cost: EXPAND_COST_GOLD })}
        // O Baú Geral é a carteira on-chain: a barra de moedas mostra o token
        // GOLD mintado via claim (— sem carteira vinculada).
        goldText={chest.onchainGold ?? '—'}
        dragSource="global"
        onItemDropped={chest.dropToGlobal as any}
      />

      {/* Diálogo de quantidade ao arrastar pilhas entre inventários 📦 */}
      {chest.transferTarget && (
        <TransferQuantityDialog
          open={!!chest.transferTarget}
          item={chest.transferTarget.item as any}
          maxQuantity={chest.transferTarget.maxQuantity}
          destinationLabel={
            chest.transferTarget.destination === 'character'
              ? (characterName || t('character'))
              : t('Global Chest')
          }
          destinationAccent={chest.transferTarget.destination === 'character' ? characterAccent : '#3b82f6'}
          onConfirm={chest.confirmTransfer}
          onClose={chest.closeTransfer}
        />
      )}
    </div>
  )
}
