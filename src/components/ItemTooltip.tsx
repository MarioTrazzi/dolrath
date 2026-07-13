'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { Item } from '@/types/item';
import { EquipmentSlotType } from '@prisma/client';
import { sellUnitPrice as sellPrice } from '@/lib/sellPricing';
import { getItemVisual, getItemTypeLabel, getItemCategory } from '@/lib/itemVisuals';
import { resolveImageUrl } from '@/lib/imageUrl';
import { itemImagePath, isIngredientItem, isMaterialItem, isSeedItem, isProcessedItem } from '@/lib/itemCatalog';
import { recipesUsingIngredient } from '@/lib/alchemy';
import { forgeRecipesUsingMaterial } from '@/lib/forge';
import { processingRecipesUsingInput } from '@/lib/processing';
import { cookingRecipesUsingInput } from '@/lib/cooking';
import { applyEnhancementToStats, getLevelLabel } from '@/lib/enhancementSystem';
import { diffItemStats, formatItemStats, formatStatValue } from '@/lib/itemStats';
import { whatItemCanProduceSummary } from '@/lib/craftProduces';
import { getSlotTypeFromItemType } from '@/lib/equipmentSlot';
import ItemCardBackdrop from '@/components/store/ItemCardBackdrop';
import ItemIcon from '@/components/ItemIcon';
import SellQuantityDialog from '@/components/inventory/SellQuantityDialog';

interface ItemTooltipProps {
  item: Item;
  isEquipped?: boolean;
  /** Nível de aprimoramento da instância (+1, +2, ...). 0 = sem aprimoramento. */
  enhancementLevel?: number;
  /** Durabilidade da instância (desgasta com o uso; 0 = quebrado, sem bônus). */
  durability?: number;
  maxDurability?: number;
  /** Id da linha de inventário (CharacterInventory). Necessário para aprimorar. */
  inventoryId?: string;
  onEquip?: (itemId: string, slotType: EquipmentSlotType) => void;
  onUnequip?: (itemId: string) => void;
  onConsume?: (itemId: string) => void;
  /** Abre o diálogo de aprimoramento. Ao vir de uma Pedra Negra, inventoryId vem
   *  vazio e `stoneCategory` indica a categoria de gear que a pedra aprimora. */
  onEnhance?: (inventoryId: string, itemName: string, stoneCategory?: 'WEAPON' | 'ARMOR') => void;
  /** Abre a dialog de profissão (Forja/Alquimia/Processamento) com o insumo já
   *  posicionado, sem sair da página — mesmo padrão do onEnhance. */
  onOpenCraft?: (craft: 'alchemy' | 'forge' | 'process' | 'cook', itemName: string) => void;
  /** Inventário global: transfere o item para o personagem selecionado.
   *  Recebe a quantidade disponível na pilha (1 = uma unidade; stack > 1 abre
   *  o diálogo de quantidade no chamador). */
  onTransfer?: (itemId: string, quantity?: number) => void;
  /** Inventário do personagem: envia o item de volta ao inventário global.
   *  Recebe a quantidade a enviar (1 = uma unidade; stack inteiro no "Enviar tudo"). */
  onSendToGlobal?: (itemId: string, quantity?: number) => void;
  /** Vende o item (equipamento) ao ferreiro por metade do preço — "burn". Funciona
   *  tanto no inventário do personagem quanto no Baú Geral (a página decide o destino
   *  do gold via inventoryId + dragSource). Recebe a linha de inventário e a quantidade. */
  onSell?: (inventoryId: string, quantity?: number) => void;
  /** Quantidade empilhada do item nesta linha de inventário (consumíveis). */
  quantity?: number;
  characterId?: string;
  /** Peça atualmente equipada no mesmo slot, para comparar stats no card do
   *  inventário (ex.: "essa espada é melhor ou pior que a equipada?"). Só faz
   *  sentido quando o item do card ainda NÃO está equipado. */
  compareTo?: { item: Item; enhancementLevel?: number } | null;
  children: React.ReactNode;
}

export function ItemTooltip({ item, isEquipped, enhancementLevel = 0, durability, maxDurability, inventoryId, onEquip, onUnequip, onConsume, onEnhance, onOpenCraft, onTransfer, onSendToGlobal, onSell, quantity = 1, characterId, compareTo, children }: ItemTooltipProps) {
  const router = useRouter();
  const [showTooltip, setShowTooltip] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placement: 'top' | 'bottom' }>({ top: 0, left: 0, placement: 'top' });
  const [mounted, setMounted] = useState(false);
  const [sellDialogOpen, setSellDialogOpen] = useState(false);
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
    const compute = () => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
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
    };
    compute();
    // Rotação/resize do celular muda a viewport com o card aberto.
    window.addEventListener('resize', compute);
    return () => window.removeEventListener('resize', compute);
  }, [showTooltip]);


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

  // Venda ao ferreiro (burn): só equipamento (consumíveis/ingredientes/materiais não
  // entram na forja), por metade do preço base — mesma regra do sell-item/RepairBench.
  const isSellable = getItemCategory(item.type) !== 'consumable';
  // Não vende peça equipada (evita apagar a linha de inventário que o slot referencia).
  const canSell = !!onSell && !!inventoryId && isSellable && !isEquipped;
  // Peça desgastada vende por menos (preço escala linear com durabilidade restante).
  const sellUnitPrice = sellPrice(item, durability, maxDurability);

  // Identidade visual idêntica à da loja (cor de destaque, chips, cenário).
  const visual = getItemVisual(item.type);
  // Imagem do card: banco (item.image) → asset estático por nome (/items/<slug>.webp)
  // → ícone genérico se a arte 404. Cobre ingredientes/materiais/cintos antigos que
  // não têm `image` no banco mas têm webp gerado (mesma cadeia do DraggableItem).
  const itemImage = imgError ? null : (resolveImageUrl(item.image) ?? (item.name ? itemImagePath(item.name) : null));
  const showEnhancement = enhancementLevel > 0;
  const isConsumable = item.type === 'CONSUMABLE';
  // Pedra Negra: consumível de aprimoramento. "Consumir" abre o seletor de aprimoramento.
  const stoneKind = (item.stats as any)?.enhancementStone as string | undefined;
  const isEnhancementStone = isConsumable && !!stoneKind;
  // Categoria de gear que a pedra aprimora (WEAPON_* → WEAPON, ARMOR_* → ARMOR).
  const stoneCategory: 'WEAPON' | 'ARMOR' | undefined = stoneKind
    ? stoneKind.startsWith('WEAPON') ? 'WEAPON' : 'ARMOR'
    : undefined;
  // Insumos de craft: ingrediente de alquimia (triângulo) e material de forja.
  // "Usar" abre a dialog de profissão (via onOpenCraft) com o item já posto, em
  // vez de "Consumir" (que não faz nada para estes itens). A classificação cai no
  // catálogo por nome quando o registro antigo não tem stats.kind. [[dolrath-alchemy-crafting]]
  const isIngredient = !isEnhancementStone && isIngredientItem(item);
  const isMaterial = !isEnhancementStone && isMaterialItem(item);
  // Insumo PROCESSADO (saída da Bancada de Processamento) — vai p/ forja/alquimia.
  const isProcessed = !isEnhancementStone && isProcessedItem(item);
  // Semente de cultivo → "Plantar" leva à fazenda (não é consumível nem insumo de bancada).
  const isSeed = !isEnhancementStone && isSeedItem(item);
  // Consumidores reais deste insumo — decidem o destino do botão principal e se o
  // botão "⚙️ Processar" aparece (um material cru pode ter DOIS usos: forjar e processar).
  const usedInAlchemy = !!item.name && recipesUsingIngredient(item.name).length > 0;
  const usedInForge = !!item.name && forgeRecipesUsingMaterial(item.name).length > 0;
  const usedInProcessing = !!item.name && processingRecipesUsingInput(item.name).length > 0;
  const usedInCooking = !!item.name && cookingRecipesUsingInput(item.name).length > 0;
  // Destino do botão principal do insumo: a bancada que de fato o consome hoje.
  // Ex.: Trigo (ingrediente) não entra em poção nenhuma → primário vira Processar;
  // Farinha (processado) só entra em prato → primário vira Cozinhar.
  const primaryCraft: 'alchemy' | 'forge' | 'process' | 'cook' | null =
    isIngredient ? (usedInAlchemy ? 'alchemy' : usedInProcessing ? 'process' : usedInCooking ? 'cook' : 'alchemy')
    : isMaterial ? (usedInForge ? 'forge' : usedInProcessing ? 'process' : 'forge')
    : isProcessed ? (usedInAlchemy ? 'alchemy' : usedInForge ? 'forge' : usedInCooking ? 'cook' : null)
    : null;
  const isCraftInput = isIngredient || isMaterial || isProcessed;
  // Segundo botão "⚙️ Processar" quando o insumo TAMBÉM é matéria-prima de
  // beneficiamento e o primário já aponta para outra bancada.
  const showProcessButton = !!onOpenCraft && isCraftInput && usedInProcessing && primaryCraft !== 'process';
  // Segundo botão "🍳 Cozinhar" quando o item também entra em prato e o primário
  // aponta pra outra bancada — cobre a Ração (consumível comum, insumo do Assado).
  const showCookButton = !!onOpenCraft && usedInCooking && primaryCraft !== 'cook' && !isEnhancementStone;
  // O que este ingrediente/material ajuda a produzir (receitas do alquimista/ferreiro
  // que o usam como insumo). Vazio para itens que não são insumo de nenhuma receita.
  const producesSummary = whatItemCanProduceSummary(item.name);

  // Estilo de botão da loja: gradiente da cor de destaque + sombra.
  const buttonStyle = (hex: string, soft: string) => ({
    background: `linear-gradient(90deg, ${hex}cc, ${hex}77)`,
    boxShadow: `0 4px 20px ${soft}`,
  });
  // Botões em grade 2 colunas → compactos (menos padding/fonte) p/ caber 2 por linha.
  const storeButtonClass =
    'w-full px-2 py-2 rounded-lg font-bold text-xs text-white transition-all hover:scale-[1.03] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap';

  const handleTransferClick = () => {
    if (onTransfer) onTransfer(item.id, quantity);
    setShowTooltip(false);
  };

  const handleSellClick = () => {
    if (!onSell || !inventoryId) return;
    // Pilha > 1: abre o diálogo de quantidade (vender tudo ou uma quantidade
    // escolhida) em vez de vender o stack inteiro direto no clique.
    if (quantity > 1) {
      setSellDialogOpen(true);
      return;
    }
    onSell(inventoryId, 1);
    setShowTooltip(false);
  };

  const handleEnhanceClick = () => {
    if (!onEnhance) return;
    // Pedra negra → abre o seletor (sem item pré-selecionado), filtrado pela
    // categoria que a pedra aprimora. Item normal → abre já com o item escolhido.
    if (isEnhancementStone) onEnhance('', '', stoneCategory);
    else if (inventoryId) onEnhance(inventoryId, item.name);
    setShowTooltip(false);
  };

  // Abre a dialog de profissão com o insumo já posicionado (Alquimia: vértice do
  // triângulo; Forja/Processamento: receita que usa o insumo pré-selecionada).
  const handleUseInCraft = (craft: 'alchemy' | 'forge' | 'process' | 'cook') => {
    onOpenCraft?.(craft, item.name);
    setShowTooltip(false);
  };

  const handleAction = () => {
    // Pedra negra: "Consumir" abre o aprimoramento em vez de consumir.
    if (isEnhancementStone) {
      handleEnhanceClick();
      return;
    }
    // Insumo → dialog da bancada que o consome; semente → fazenda. O insumo
    // vem ANTES do braço de consumível: processados/ingredientes são
    // CONSUMABLE no banco, mas "consumir" não faz nada com eles.
    if (isSeed) {
      router.push('/farm');
      setShowTooltip(false);
      return;
    }
    if (isCraftInput) {
      if (primaryCraft) handleUseInCraft(primaryCraft);
      else setShowTooltip(false); // insumo órfão (nenhuma bancada o consome hoje)
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

  // Comparação vs. a peça equipada no mesmo slot (só no card do inventário,
  // nunca no da própria peça equipada) — mostra se trocar é upgrade ou downgrade.
  const statDiff = !isEquipped && compareTo
    ? diffItemStats(
        applyEnhancementToStats(item.stats, enhancementLevel),
        applyEnhancementToStats(compareTo.item.stats, compareTo.enhancementLevel || 0),
        item.type
      )
    : [];

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
          className="fixed w-72 max-w-[calc(100vw-16px)] max-h-[80dvh] rounded-2xl border-2 overflow-hidden shadow-2xl group"
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

          {/* Conteúdo (rola por dentro quando o card não cabe na tela do celular) */}
          <div className="relative p-4 flex flex-col max-h-[80dvh] overflow-y-auto overscroll-contain">
            <div className="w-full aspect-square relative mb-3 rounded-xl overflow-hidden bg-black/40 ring-1 ring-white/10 flex items-center justify-center">
              {itemImage ? (
                <img
                  src={itemImage}
                  alt={item.name}
                  onError={() => setImgError(true)}
                  className="w-full h-full object-cover art-bright"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <ItemIcon type={item.type} size={56} className="text-white/80" />
              )}
            </div>

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
                  {getLevelLabel(enhancementLevel)}
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

            {/* Comparação vs. peça equipada no mesmo slot */}
            {statDiff.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] font-semibold text-white/50 mb-1">Vs. equipado</p>
                <div className="flex flex-wrap gap-1.5">
                  {statDiff.map((d) => (
                    <span
                      key={d.key}
                      className={`text-xs font-bold px-2 py-1 rounded-full ${
                        d.delta > 0 ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
                      }`}
                    >
                      {d.label}: {d.delta > 0 ? '+' : ''}{formatStatValue(d.delta)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Durabilidade (equipamento desgasta com o uso; 0 = quebrado) */}
            {typeof durability === 'number' && typeof maxDurability === 'number' && maxDurability > 0 && (
              <div className="mb-3">
                <div className="flex justify-between text-xs mb-1">
                  <span className={durability <= 0 ? 'text-red-400 font-bold' : 'text-white/60'}>
                    {durability <= 0 ? '💔 QUEBRADO' : 'Durabilidade'}
                  </span>
                  <span className="text-white/60">{durability}/{maxDurability}</span>
                </div>
                <div className="w-full h-1.5 bg-black/50 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round((durability / maxDurability) * 100)}%`,
                      background: durability / maxDurability < 0.3 ? '#ef4444' : durability / maxDurability < 0.7 ? '#f59e0b' : '#10b981',
                    }}
                  />
                </div>
                {durability <= 0 && (
                  <p className="text-xs text-red-300 mt-1">Sem bônus até reparar no ferreiro.</p>
                )}
              </div>
            )}

            {/* Special Effect */}
            {item.stats.specialEffect && (
              <p className="text-sm text-purple-300 mb-3 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">✨ {item.stats.specialEffect}</p>
            )}

            {producesSummary && (
              <p className="text-xs font-semibold text-sky-300 mb-3">{producesSummary}</p>
            )}

            <div className="text-base font-semibold text-amber-400 mb-3 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">
              💰 {item.goldPrice} gold
            </div>

            {/* Botões em grade de 2 colunas (máx. 2 linhas): cada par divide uma linha.
                Um botão ímpar solto ocupa a linha inteira p/ não ficar meia-largura torto. */}
            {(() => {
              const btns: JSX.Element[] = [];

              if (onTransfer) {
                // Inventário global: transferir para o personagem (pilha > 1 abre o diálogo).
                btns.push(
                  <button key="transfer" onClick={handleTransferClick} className={storeButtonClass} style={buttonStyle('#3b82f6', 'rgba(59,130,246,0.35)')}>
                    {quantity > 1 ? `🌐 Transferir x${quantity}` : '🌐 Transferir'}
                  </button>
                );
              } else {
                const actionStyle =
                  isEnhancementStone ? buttonStyle('#f59e0b', 'rgba(245,158,11,0.35)')
                  : isSeed ? buttonStyle('#84cc16', 'rgba(132,204,22,0.35)')
                  : isCraftInput ? (
                      primaryCraft === 'alchemy' ? buttonStyle('#10b981', 'rgba(16,185,129,0.35)')
                      : primaryCraft === 'forge' ? buttonStyle('#f97316', 'rgba(249,115,22,0.35)')
                      : primaryCraft === 'process' ? buttonStyle('#8b5cf6', 'rgba(139,92,246,0.35)')
                      : primaryCraft === 'cook' ? buttonStyle('#eab308', 'rgba(234,179,8,0.35)')
                      : buttonStyle('#6b7280', 'rgba(107,114,128,0.35)')
                    )
                  : isConsumable ? buttonStyle('#22c55e', 'rgba(34,197,94,0.35)')
                  : isEquipped ? buttonStyle('#ef4444', 'rgba(239,68,68,0.35)')
                  : buttonStyle(visual.accent, visual.accentSoft);
                const actionLabel =
                  isEnhancementStone ? '⚒️ Aprimorar'
                  : isSeed ? '🌾 Plantar'
                  : isCraftInput ? (
                      primaryCraft === 'alchemy' ? '⚗️ Alquimia'
                      : primaryCraft === 'forge' ? '⚒️ Forja'
                      : primaryCraft === 'process' ? '⚙️ Processar'
                      : primaryCraft === 'cook' ? '🍳 Cozinhar'
                      : '🧺 Sem uso na bancada'
                    )
                  : isConsumable ? '🧪 Consumir'
                  : isEquipped ? '⚔️ Desequipar'
                  : '🛡️ Equipar';
                btns.push(
                  <button
                    key="action"
                    onClick={handleAction}
                    disabled={isCraftInput && !primaryCraft}
                    className={storeButtonClass}
                    style={actionStyle}
                  >
                    {actionLabel}
                  </button>
                );

                // ⚙️ Segundo uso do insumo cru: beneficiar na Bancada de Processamento
                // (o primário já aponta p/ forja/alquimia; este abre o processamento).
                if (showProcessButton) {
                  btns.push(
                    <button key="process" onClick={() => handleUseInCraft('process')} className={storeButtonClass} style={buttonStyle('#8b5cf6', 'rgba(139,92,246,0.35)')}>
                      ⚙️ Processar
                    </button>
                  );
                }

                // 🍳 Segundo uso: o insumo também entra em prato da Culinária
                // (Água Pura, Erva, Raiz, Cogumelo, Seiva, Ração...).
                if (showCookButton) {
                  btns.push(
                    <button key="cook" onClick={() => handleUseInCraft('cook')} className={storeButtonClass} style={buttonStyle('#eab308', 'rgba(234,179,8,0.35)')}>
                      🍳 Cozinhar
                    </button>
                  );
                }

                if (canEnhance) {
                  btns.push(
                    <button key="enhance" onClick={handleEnhanceClick} className={storeButtonClass} style={buttonStyle('#f59e0b', 'rgba(245,158,11,0.35)')}>
                      ⚒️ Aprimorar
                    </button>
                  );
                }
                if (onSendToGlobal && !isEquipped) {
                  btns.push(
                    <button key="global" onClick={() => { onSendToGlobal(item.id, 1); setShowTooltip(false); }} className={storeButtonClass} style={buttonStyle('#3b82f6', 'rgba(59,130,246,0.35)')}>
                      🌐 Ao Global
                    </button>
                  );
                }
                if (onSendToGlobal && !isEquipped && quantity > 1) {
                  btns.push(
                    <button key="all" onClick={() => { onSendToGlobal(item.id, quantity); setShowTooltip(false); }} className={storeButtonClass} style={buttonStyle('#3b82f6', 'rgba(59,130,246,0.35)')}>
                      🌐 Tudo x{quantity}
                    </button>
                  );
                }
              }

              // 🔥 Vender ao ferreiro (burn): só equipamento; destrói por metade do preço.
              if (canSell) {
                btns.push(
                  <button key="sell" onClick={handleSellClick} className={storeButtonClass} style={buttonStyle('#dc2626', 'rgba(220,38,38,0.35)')}>
                    🔥 Vender {sellUnitPrice}🪙
                  </button>
                );
              }

              return (
                <div className="mt-auto grid grid-cols-2 gap-2">
                  {btns.map((b, i) =>
                    btns.length % 2 === 1 && i === btns.length - 1
                      ? <div key="last-wide" className="col-span-2">{b}</div>
                      : b
                  )}
                </div>
              );
            })()}
          </div>
        </div>,
        document.body
      )}
      {canSell && inventoryId && (
        <SellQuantityDialog
          open={sellDialogOpen}
          item={item}
          maxQuantity={quantity}
          unitPrice={sellUnitPrice}
          onConfirm={(qty) => onSell!(inventoryId, qty)}
          onClose={() => setSellDialogOpen(false)}
        />
      )}
    </div>
  );
}
