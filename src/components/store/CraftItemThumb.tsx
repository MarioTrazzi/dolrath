'use client';

import { useState, useRef, useEffect, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  itemImagePath,
  getIngredientByName,
  getForgeMaterialByName,
  getConsumableByName,
  getCatalogItemByName,
  type Rarity,
} from '@/lib/itemCatalog';
import { getItemVisual, getItemTypeLabel } from '@/lib/itemVisuals';
import { formatItemStats } from '@/lib/itemStats';
import { whatItemCanProduce } from '@/lib/craftProduces';

// Cores e rótulo por raridade (espelha o /doc e as bancadas).
const RARITY_UI: Record<Rarity, { label: string; text: string; ring: string; glow: string }> = {
  COMMON: { label: 'Comum', text: 'text-zinc-300', ring: '#a1a1aa', glow: 'rgba(161,161,170,0.5)' },
  UNCOMMON: { label: 'Incomum', text: 'text-emerald-300', ring: '#34d399', glow: 'rgba(52,211,153,0.5)' },
  RARE: { label: 'Raro', text: 'text-sky-300', ring: '#38bdf8', glow: 'rgba(56,189,248,0.5)' },
  EPIC: { label: 'Épico', text: 'text-fuchsia-300', ring: '#e879f9', glow: 'rgba(232,121,249,0.5)' },
  LEGENDARY: { label: 'Lendário', text: 'text-amber-300', ring: '#fbbf24', glow: 'rgba(251,191,36,0.5)' },
};

interface CraftMeta {
  kindLabel: string;
  emoji: string;
  rarity: Rarity;
  description: string;
  value: number;
  stats?: Record<string, any> | null;
  statType?: string;
}

// Resolve a ficha do item pelo nome, consultando todos os catálogos relevantes às
// bancadas (ingredientes, materiais de forja, consumíveis/poções e equipamentos).
function resolveMeta(name: string): CraftMeta | null {
  const ing = getIngredientByName(name);
  if (ing) return { kindLabel: 'Ingrediente de Alquimia', emoji: ing.emoji, rarity: ing.rarity, description: ing.description, value: ing.goldValue };
  const mat = getForgeMaterialByName(name);
  if (mat) return { kindLabel: 'Material de Forja', emoji: mat.emoji, rarity: mat.rarity, description: mat.description, value: mat.goldValue };
  const con = getConsumableByName(name);
  if (con) return { kindLabel: 'Consumível', emoji: '🧪', rarity: con.rarity, description: con.description, value: con.goldPrice, stats: con.stats, statType: 'CONSUMABLE' };
  const cat = getCatalogItemByName(name);
  if (cat) return { kindLabel: getItemTypeLabel(cat.type), emoji: getItemVisual(cat.type).emoji, rarity: cat.rarity, description: cat.description, value: cat.goldPrice, stats: cat.stats, statType: cat.type };
  return null;
}

const CARD_W = 248;

/**
 * Miniatura de item das bancadas (alquimista/ferreiro) com CARD de detalhe ao
 * passar o mouse. Substitui o antigo `ItemThumb` local de cada bancada para que
 * TODO ícone — por menor que seja — possa ser visto grande, com nome, raridade,
 * descrição e atributos. A imagem usa /items/<slug>.webp e cai no emoji se faltar.
 */
export function CraftItemThumb({
  name,
  emoji,
  className = 'text-2xl',
}: {
  name: string;
  emoji: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [cardFailed, setCardFailed] = useState(false);
  const [show, setShow] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const wrapRef = useRef<HTMLSpanElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  // Touch: hover não existe; segurar o dedo (~400ms) abre o card. O tap curto
  // continua livre para a ação do pai (colocar o ingrediente na bancada).
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const startPress = () => {
    longPressFired.current = false;
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setShow(true);
    }, 400);
  };
  const cancelPress = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
  };

  useEffect(() => setMounted(true), []);
  useEffect(() => cancelPress, []);

  // Tap fora fecha o card aberto por long-press (o card é pointer-events-none).
  useEffect(() => {
    if (!show) return;
    const close = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setShow(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [show]);

  useLayoutEffect(() => {
    if (!show || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    const h = cardRef.current?.getBoundingClientRect().height ?? 280;
    const M = 8;
    let left = r.left + r.width / 2 - CARD_W / 2;
    left = Math.max(M, Math.min(left, window.innerWidth - CARD_W - M));
    let top = r.top - M - h; // prefere acima
    if (top < M) top = r.bottom + M; // senão abaixo
    if (top + h > window.innerHeight - M) top = Math.max(M, window.innerHeight - M - h);
    setCoords({ top, left });
  }, [show]);

  const meta = resolveMeta(name);
  const ui = meta ? RARITY_UI[meta.rarity] : null;
  const cardImg = itemImagePath(name);
  const stats = meta?.stats ? formatItemStats(meta.stats, meta.statType) : [];
  const produces = whatItemCanProduce(name);

  return (
    <span
      ref={wrapRef}
      className="grid place-items-center w-full h-full select-none"
      style={{ WebkitTouchCallout: 'none' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
      onTouchStart={startPress}
      onTouchMove={cancelPress}
      onTouchEnd={(e) => {
        cancelPress();
        // Long-press consumiu o gesto: não deixa virar o click do pai.
        if (longPressFired.current) e.preventDefault();
      }}
      onTouchCancel={cancelPress}
      onContextMenu={(e) => {
        if (longPressFired.current) e.preventDefault();
      }}
      onClickCapture={(e) => {
        if (longPressFired.current) {
          e.preventDefault();
          e.stopPropagation();
          longPressFired.current = false;
        }
      }}
    >
      {failed ? (
        <span className={className}>{emoji}</span>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={itemImagePath(name)}
          alt={name}
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      )}

      {show && mounted && createPortal(
        <div
          ref={cardRef}
          className="pointer-events-none fixed z-[9999] rounded-2xl border-2 overflow-hidden shadow-2xl bg-zinc-950/95 backdrop-blur-sm"
          style={{ width: CARD_W, top: coords.top, left: coords.left, borderColor: (ui?.ring ?? '#52525b') + '88' }}
        >
          <div className="p-3 flex flex-col">
            <div className="w-full aspect-square relative mb-2 rounded-xl overflow-hidden bg-black/50 ring-1 ring-white/10 grid place-items-center">
              {cardFailed ? (
                <span className="text-5xl">{meta?.emoji ?? emoji}</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={cardImg}
                  alt={name}
                  onError={() => setCardFailed(true)}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              )}
            </div>

            <h3 className="font-black text-base leading-tight text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]">{name}</h3>

            <div className="flex items-center gap-1.5 mt-1 mb-1.5 flex-wrap">
              {ui && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ color: ui.ring, background: ui.ring + '22' }}>
                  {ui.label}
                </span>
              )}
              {meta && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-white/70">
                  {meta.kindLabel}
                </span>
              )}
            </div>

            {meta?.description && (
              <p className="text-xs text-white/60 leading-snug mb-2 drop-shadow-[0_1px_3px_rgba(0,0,0,0.9)]">{meta.description}</p>
            )}

            {stats.length > 0 && (
              <div className="flex flex-wrap gap-1 mb-2">
                {stats.map((s, i) => (
                  <span key={i} className="text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 rounded-full">{s}</span>
                ))}
              </div>
            )}

            {produces.length > 0 && (
              <div className="mb-2">
                <div className="text-[10px] font-bold text-white/50 uppercase tracking-wide mb-1">Pode produzir</div>
                <div className="flex flex-wrap gap-1">
                  {produces.map((n) => (
                    <span key={n} className="text-[10px] font-semibold bg-sky-500/20 text-sky-300 px-1.5 py-0.5 rounded-full">{n}</span>
                  ))}
                </div>
              </div>
            )}

            {meta && meta.value > 0 && (
              <div className="text-xs font-semibold text-amber-400">💰 {meta.value} gold</div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </span>
  );
}
