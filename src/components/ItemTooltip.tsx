'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { Item } from '@/types/item';
import { EquipmentSlotType } from '@prisma/client';
import { getItemVisual, getItemTypeLabel } from '@/lib/itemVisuals';
import { resolveImageUrl } from '@/lib/imageUrl';
import { applyEnhancementToStats } from '@/lib/enhancementSystem';
import { formatItemStats } from '@/lib/itemStats';
import ItemCardBackdrop from '@/components/store/ItemCardBackdrop';

interface ItemTooltipProps {
  item: Item;
  isEquipped?: boolean;
  /** Nível de aprimoramento da instância (+1, +2, ...). 0 = sem aprimoramento. */
  enhancementLevel?: number;
  /** Id da linha de inventário (CharacterInventory). Necessário para aprimorar. */
  inventoryId?: string;
  onEquip?: (itemId: string, slotType: EquipmentSlotType) => void;
  onUnequip?: (itemId: string) => void;
  onConsume?: (itemId: string) => void;
  onEnhance?: (inventoryId: string, itemName: string) => void;
  /** Inventário global: transfere o item para o personagem selecionado. */
  onTransfer?: (itemId: string) => void;
  /** Inventário do personagem: envia o item de volta ao inventário global. */
  onSendToGlobal?: (itemId: string) => void;
  characterId?: string;
  children: React.ReactNode;
}

export function ItemTooltip({ item, isEquipped, enhancementLevel = 0, inventoryId, onEquip, onUnequip, onConsume, onEnhance, onTransfer, onSendToGlobal, characterId, children }: ItemTooltipProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({ top: 0, left: 0, placement: 'top' });
  const [mounted, setMounted] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<NodeJS.Timeout>();
  const hideTimeoutRef = useRef<NodeJS.Timeout>();

  useEffect(() => setMounted(true), []);

  const TOOLTIP_WIDTH = 288; // w-72

  // Posiciona o tooltip (via portal, position: fixed) a partir da posição do item,
  // escapando de overflow/stacking contexts dos painéis ao redor. Mede a altura real
  // do card e mantém tudo dentro da viewport (prefere acima, senão abaixo, com clamp).
  useLayoutEffect(() => {
    if (!showTooltip || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const tipH = tooltipRef.current?.getBoundingClientRect().height ?? 360;
    const GAP = 8;
    const M = 8;

    let left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
    left = Math.max(M, Math.min(left, window.innerWidth - TOOLTIP_WIDTH - M));

    // Prefere acima do item; se não couber, mostra abaixo.
    let top = rect.top - GAP - tipH;
    if (top < M) top = rect.bottom + GAP;
    // Garante que não ultrapasse o rodapé da viewport.
    if (top + tipH > window.innerHeight - M) {
      top = Math.max(M, window.innerHeight - M - tipH);
    }

    setCoords({ top, left, placement: 'bottom' });
  }, [showTooltip]);

  const getSlotTypeFromItemType = (itemType: string): EquipmentSlotType => {
    switch (itemType) {
      case 'LIGHT_HELMET':
      case 'MEDIUM_HELMET':
      case 'HEAVY_HELMET':
        return 'HELMET';
      case 'LIGHT_ARMOR':
      case 'MEDIUM_ARMOR':
      case 'HEAVY_ARMOR':
        return 'ARMOR';
      case 'SWORD':
      case 'AXE':
      case 'DAGGER':
      case 'STAFF':
      case 'BOW':
        return 'WEAPON';
      case 'SHIELD':
        return 'SHIELD';
      case 'LIGHT_GLOVES':
      case 'MEDIUM_GLOVES':
      case 'HEAVY_GLOVES':
        return 'GLOVES';
      case 'LIGHT_BOOTS':
      case 'MEDIUM_BOOTS':
      case 'HEAVY_BOOTS':
        return 'BOOTS';
      case 'NECKLACE':
        return 'NECKLACE';
      case 'RING':
        return 'RING_1'; // Sempre tentar RING_1 primeiro, a API vai decidir o slot final
      default:
        return 'WEAPON';
    }
  };

  const handleMouseEnter = () => {
    timeoutRef.current = setTimeout(() => {
      setShowTooltip(true);
    }, 200);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    // Delay antes de esconder o tooltip
    hideTimeoutRef.current = setTimeout(() => {
      setShowTooltip(false);
    }, 300); // 300ms de delay
  };

  const handleTooltipMouseEnter = () => {
    // Cancelar o timeout de esconder se o mouse entrar no tooltip
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
  };

  const handleTooltipMouseLeave = () => {
    // Esconder imediatamente quando sair do tooltip
    setShowTooltip(false);
  };

  // Limpeza dos timeouts quando o componente for desmontado
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, []);

  // Fecha o card ao clicar fora dele (quando aberto por clique).
  useEffect(() => {
    if (!showTooltip) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      setShowTooltip(false);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [showTooltip]);

  const handleClick = () => {
    // Clicar abre/fecha o card de opções (alternativa ao drag and drop).
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    setShowTooltip((prev) => !prev);
  };

  // Aprimoramento só faz sentido para equipamentos que estão no inventário.
  const canEnhance = !!onEnhance && !!inventoryId && item.type !== 'CONSUMABLE';

  // Identidade visual idêntica à da loja (cor de destaque, chips, cenário).
  const visual = getItemVisual(item.type);
  const itemImage = resolveImageUrl(item.image);
  const showEnhancement = enhancementLevel > 0;
  const isConsumable = item.type === 'CONSUMABLE';
  // Pedra Negra: consumível de aprimoramento. "Consumir" abre o seletor de aprimoramento.
  const isEnhancementStone = isConsumable && !!(item.stats as any)?.enhancementStone;

  // Estilo de botão da loja: gradiente da cor de destaque + sombra.
  const buttonStyle = (hex: string, soft: string) => ({
    background: `linear-gradient(90deg, ${hex}cc, ${hex}77)`,
    boxShadow: `0 4px 20px ${soft}`,
  });
  const storeButtonClass =
    'w-full px-4 py-2.5 rounded-xl font-black text-sm text-white transition-all hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed';

  const handleTransferClick = () => {
    if (onTransfer) onTransfer(item.id);
    setShowTooltip(false);
  };

  const handleEnhanceClick = () => {
    if (!onEnhance) return;
    // Pedra negra → abre o seletor (sem item pré-selecionado).
    // Item normal → abre já com o item escolhido.
    if (isEnhancementStone) onEnhance('', '');
    else if (inventoryId) onEnhance(inventoryId, item.name);
    setShowTooltip(false);
  };

  const handleAction = () => {
    // Pedra negra: "Consumir" abre o aprimoramento em vez de consumir.
    if (isEnhancementStone) {
      handleEnhanceClick();
      return;
    }
    // Para itens consumíveis, consumir ao invés de equipar
    if (item.type === 'CONSUMABLE' && onConsume && characterId) {
      onConsume(item.id);
    } else if (isEquipped && onUnequip) {
      onUnequip(item.id);
    } else if (!isEquipped && onEquip) {
      const slotType = getSlotTypeFromItemType(item.type);
      onEquip(item.id, slotType);
    }
    setShowTooltip(false); // Hide tooltip after action
  };

  // Stats já com o aprimoramento aplicado (mesma fórmula usada em combate).
  const formatStats = () =>
    formatItemStats(applyEnhancementToStats(item.stats, enhancementLevel), item.type);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={handleClick}
    >
      {children}

      {showTooltip && mounted && createPortal(
        <div
          ref={tooltipRef}
          className="fixed w-72 rounded-2xl border-2 overflow-hidden shadow-2xl group"
          style={{
            borderColor: visual.accent + '55',
            top: coords.top,
            left: coords.left,
            zIndex: 9999,
          }}
          onMouseEnter={handleTooltipMouseEnter}
          onMouseLeave={handleTooltipMouseLeave}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Backdrop animado por categoria (igual à loja) */}
          <div className="absolute inset-0">
            <ItemCardBackdrop category={visual.category} />
          </div>
          <div className="absolute inset-0 bg-black/45" />

          {/* Conteúdo */}
          <div className="relative p-4 flex flex-col">
            {itemImage && (
              <div className="w-full aspect-square relative mb-3 rounded-xl overflow-hidden bg-black/40 ring-1 ring-white/10">
                <img
                  src={itemImage}
                  alt={item.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              </div>
            )}

            <h3 className="font-black text-lg mb-2 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">{item.name}</h3>

            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${visual.chipBg} ${visual.chipText}`}>
                {visual.emoji} {getItemTypeLabel(item.type)}
              </span>
              {item.level > 0 && (
                <span className="text-xs font-semibold bg-amber-500/30 text-amber-300 px-2 py-1 rounded-full">
                  Lv.{item.level}
                </span>
              )}
              {showEnhancement && (
                <span className="text-xs font-black bg-yellow-500/30 text-yellow-200 px-2 py-1 rounded-full">
                  +{enhancementLevel}
                </span>
              )}
            </div>

            {item.description && (
              <p className="text-sm text-white/60 mb-3 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{item.description}</p>
            )}

            {/* Stats */}
            {formatStats().length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {formatStats().map((stat, index) => (
                  <span key={index} className="text-xs font-semibold bg-emerald-500/20 text-emerald-300 px-2 py-1 rounded-full">
                    {stat}
                  </span>
                ))}
              </div>
            )}

            {/* Special Effect */}
            {item.stats.specialEffect && (
              <p className="text-sm text-purple-300 mb-3 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">✨ {item.stats.specialEffect}</p>
            )}

            <div className="text-base font-semibold text-amber-400 mb-3 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              💰 {item.goldPrice} gold
            </div>

            {/* Botões — mesmo estilo da loja */}
            <div className="mt-auto flex flex-col gap-2">
              {onTransfer ? (
                /* Inventário global: só transferir para o personagem */
                <button
                  onClick={handleTransferClick}
                  className={storeButtonClass}
                  style={buttonStyle('#3b82f6', 'rgba(59,130,246,0.35)')}
                >
                  🌐 Transferir
                </button>
              ) : (
                <>
                  <button
                    onClick={handleAction}
                    className={storeButtonClass}
                    style={
                      isEnhancementStone
                        ? buttonStyle('#f59e0b', 'rgba(245,158,11,0.35)')
                        : isConsumable
                        ? buttonStyle('#22c55e', 'rgba(34,197,94,0.35)')
                        : isEquipped
                        ? buttonStyle('#ef4444', 'rgba(239,68,68,0.35)')
                        : buttonStyle(visual.accent, visual.accentSoft)
                    }
                  >
                    {isEnhancementStone
                      ? '⚒️ Aprimorar'
                      : isConsumable
                      ? '🧪 Consumir'
                      : isEquipped
                      ? '⚔️ Desequipar'
                      : '🛡️ Equipar'}
                  </button>

                  {canEnhance && (
                    <button
                      onClick={handleEnhanceClick}
                      className={storeButtonClass}
                      style={buttonStyle('#f59e0b', 'rgba(245,158,11,0.35)')}
                    >
                      ⚒️ Aprimorar
                    </button>
                  )}

                  {onSendToGlobal && !isEquipped && (
                    <button
                      onClick={() => { onSendToGlobal(item.id); setShowTooltip(false); }}
                      className={storeButtonClass}
                      style={buttonStyle('#3b82f6', 'rgba(59,130,246,0.35)')}
                    >
                      🌐 Enviar ao Global
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
