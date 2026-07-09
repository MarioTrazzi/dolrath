'use client';

// 🏛️ Primitivos visuais das dialogs de profissão (Forja/Alquimia) — estilo BDO.
//
// Copiados da EnhancementDialog.tsx (a referência visual do redesign), que fica
// intocada: painel chumbo com faixas, ouro envelhecido, molduras em losango com
// cravos, cometa de luz e veredito no próprio slot. Qualquer dialog nova de
// craft deve montar em cima destes blocos para manter a mesma assinatura.

import { ReactNode, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import type { Rarity } from '@/lib/itemCatalog';

// Paleta do painel (chumbo + ouro envelhecido, tirada da referência)
export const GOLD = '#c9a25f';
export const GOLD_BRIGHT = '#e7c682';
export const WARN = '#e09a3a';
export const BG_PANEL = '#1e1e21';
export const BG_STRIP = '#19191c';
export const BORDER = '#46464c';
export const BORDER_GOLD = '#8a6d3b';

// ============================================================
// Tokens de PÁGINA (janelas fora de dialog) — usados na ficha do personagem,
// dashboard e demais páginas que adotaram o estilo. Fundo levemente translúcido
// para o cenário animado atrás respirar.
// ============================================================
export const PANEL_BG = 'linear-gradient(180deg, rgba(32,32,36,0.94), rgba(24,24,27,0.96))';
export const TITLEBAR_BG = 'linear-gradient(180deg, #2b2b2f, #1a1a1d)';

/** Classes do painel-janela (combine com style={{ background: PANEL_BG }}). */
export const PANEL_CLASS =
  'overflow-hidden rounded-[4px] border border-[#46464c] shadow-2xl shadow-black/60';

/** Botão em bisel neutro (secundário) — classes prontas para <button>. */
export const BEVEL_BTN_CLASS =
  'rounded-[3px] border border-[#46464c] bg-gradient-to-b from-[#2b2b2f] to-[#1c1c1f] font-semibold text-[#c9c9ce] transition-colors hover:border-[#8a6d3b] hover:text-white';

/** Estilos inline dos botões em bisel coloridos (ouro/vermelho/roxo/verde). */
export const BEVEL_VARIANTS = {
  gold: {
    borderColor: BORDER_GOLD,
    background: 'linear-gradient(180deg, #3a3325, #241f16)',
    color: GOLD_BRIGHT,
    boxShadow: 'inset 0 1px 0 rgba(231,198,130,0.25), 0 0 14px rgba(201,162,95,0.2)',
  },
  red: {
    borderColor: '#8a3b3b',
    background: 'linear-gradient(180deg, #3a2525, #241616)',
    color: '#f0a8a8',
    boxShadow: 'inset 0 1px 0 rgba(240,168,168,0.2), 0 0 14px rgba(201,70,70,0.15)',
  },
  purple: {
    borderColor: '#5b3b8a',
    background: 'linear-gradient(180deg, #2e2540, #1c1626)',
    color: '#c9b3ec',
    boxShadow: 'inset 0 1px 0 rgba(201,179,236,0.2), 0 0 14px rgba(139,92,246,0.15)',
  },
  green: {
    borderColor: '#2f6b3a',
    background: 'linear-gradient(180deg, #25351f, #161f12)',
    color: '#a7e8b4',
    boxShadow: 'inset 0 1px 0 rgba(167,232,180,0.2), 0 0 14px rgba(74,180,94,0.15)',
  },
} as const;

/** Classes comuns dos botões coloridos (usar junto de BEVEL_VARIANTS[v] no style). */
export const BEVEL_COLOR_BTN_CLASS =
  'rounded-[3px] border font-semibold tracking-wide transition-all hover:brightness-125';

/**
 * 🪟 Janela chumbo de página: painel + barra de título em bisel.
 * `right` renderiza no canto direito da barra (botões/ações).
 */
export function BdoWindow({
  icon,
  title,
  right,
  children,
  className = '',
  bodyClassName = '',
}: {
  icon?: ReactNode;
  title: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <div className={`${PANEL_CLASS} ${className}`} style={{ background: PANEL_BG }}>
      <div
        className="flex items-center gap-2 px-4 py-2.5"
        style={{ background: TITLEBAR_BG, borderBottom: '1px solid rgba(0,0,0,0.7)' }}
      >
        {icon != null && <span style={{ color: GOLD }}>{icon}</span>}
        <span className="text-[15px] font-semibold tracking-wide text-[#dcdce0]">{title}</span>
        <div className="flex-1" />
        {right}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}

// Cores por raridade (espelha o /doc e as bancadas antigas).
export const RARITY_UI: Record<Rarity, { label: string; text: string; ring: string; glow: string }> = {
  COMMON: { label: 'Comum', text: 'text-zinc-300', ring: '#a1a1aa', glow: 'rgba(161,161,170,0.6)' },
  UNCOMMON: { label: 'Incomum', text: 'text-emerald-300', ring: '#34d399', glow: 'rgba(52,211,153,0.6)' },
  RARE: { label: 'Rara', text: 'text-sky-300', ring: '#38bdf8', glow: 'rgba(56,189,248,0.6)' },
  EPIC: { label: 'Épica', text: 'text-fuchsia-300', ring: '#e879f9', glow: 'rgba(232,121,249,0.6)' },
  LEGENDARY: { label: 'Lendária', text: 'text-amber-300', ring: '#fbbf24', glow: 'rgba(251,191,36,0.6)' },
};

/** Fases da animação: luz sai dos insumos, percorre o circuito e revela o veredito. */
export type CraftPhase = 'idle' | 'charging' | 'done';

/** Duração da canalização — também esconde a latência do servidor (como na referência). */
export const CHARGE_MS = 1600;

/** Cor do texto da chance (verde ≥70%, âmbar ≥30%, vermelho abaixo). */
export function chanceColorClass(chance: number | null | undefined): string {
  const c = chance ?? 0;
  return c >= 0.7 ? 'text-emerald-300' : c >= 0.3 ? 'text-amber-300' : 'text-red-400';
}

// ============================================================
// Casca da dialog: portal no body + overlay + card + barra de título em bisel
// ============================================================

export function BdoDialogShell({
  open,
  onClose,
  icon,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  icon: string;
  title: string;
  children: ReactNode;
}) {
  // Só monta após a hidratação: dialogs que nascem abertas (mocks/deep-link)
  // renderizariam o portal já no 1º render do client e divergiriam do SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!open || !mounted || typeof document === 'undefined') return null;
  // Portal no body: pais com backdrop-filter criam bloco de contenção para
  // position:fixed e cortariam a dialog (mesma razão da EnhancementDialog).
  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, y: 16 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 16 }}
          className="flex max-h-[90dvh] w-full max-w-md flex-col overflow-hidden rounded-[4px] border border-[#46464c] bg-[#1e1e21] shadow-2xl shadow-black/80"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Barra de título (faixa em bisel, como na referência) */}
          <div className="flex shrink-0 items-center justify-between border-b border-black/70 bg-gradient-to-b from-[#2b2b2f] to-[#1a1a1d] px-4 py-2.5">
            <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-wide text-[#dcdce0]">
              <span style={{ color: GOLD }}>{icon}</span> {title}
            </h2>
            <button
              onClick={onClose}
              className="px-2 py-0.5 text-[#8a8a90] transition-colors hover:text-white"
            >
              ✕
            </button>
          </div>
          {/* Corpo rolável */}
          <div className="overflow-y-auto overflow-x-hidden [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {children}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

// ============================================================
// ◆ Moldura em losango com cravos — o slot-assinatura da referência
// ============================================================

export type SlotVerdict = 'success' | 'fail' | 'mixed' | null;

/**
 * Slot em losango (rotate-45) com 4 cravos, arte recortada e veredito no
 * próprio slot: explosão dourada (sucesso), brilho vermelho + shake (falha),
 * dourado sóbrio no lote misto. `children` é renderizado desrotacionado.
 */
export function DiamondSlot({
  size,
  children,
  active = false,
  dashed = false,
  verdict = null,
  charging = false,
  glowColor,
  onClick,
  title,
  plate,
  verdictKey = 0,
}: {
  size: number;
  children?: ReactNode;
  /** Tem conteúdo: moldura dourada acesa; senão apagada (cinza). */
  active?: boolean;
  /** Slot vazio convidando a preencher (borda tracejada). */
  dashed?: boolean;
  verdict?: SlotVerdict;
  charging?: boolean;
  /** Sobrepõe o glow padrão dourado (ex.: cor da raridade). */
  glowColor?: string;
  onClick?: () => void;
  title?: string;
  /** Plaquinha no vértice inferior (ex.: ×N do lote). */
  plate?: string | null;
  /** Muda a cada tentativa para reiniciar as animações de veredito. */
  verdictKey?: number;
}) {
  const glow = glowColor ?? 'rgba(201,162,95,0.28)';
  const Tag = onClick ? motion.button : motion.div;
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      title={title}
      animate={verdict === 'fail' ? { x: [0, -6, 6, -4, 4, -2, 2, 0] } : { x: 0 }}
      transition={{ duration: 0.5 }}
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      {/* Moldura externa (a borda brilha quando a luz chega) */}
      <motion.div
        className="absolute rotate-45 rounded-[3px] border bg-gradient-to-br from-[#2c2620] to-[#141210]"
        style={{ inset: size * 0.15, borderStyle: dashed ? 'dashed' : 'solid' }}
        animate={
          verdict === 'success' || verdict === 'mixed'
            ? {
                borderColor: GOLD_BRIGHT,
                boxShadow: [
                  `0 0 ${size * 0.17}px ${glow}`,
                  `0 0 ${size * 0.38}px rgba(231,198,130,0.95)`,
                  `0 0 ${size * 0.2}px rgba(201,162,95,0.5)`,
                ],
              }
            : verdict === 'fail'
              ? {
                  borderColor: '#7a2222',
                  boxShadow: [
                    `0 0 ${size * 0.17}px ${glow}`,
                    `0 0 ${size * 0.2}px rgba(120,15,15,0.6)`,
                    `0 0 ${size * 0.12}px rgba(120,15,15,0.35)`,
                  ],
                }
              : {
                  borderColor: active ? BORDER_GOLD : '#3c3c41',
                  boxShadow: active ? `0 0 ${size * 0.17}px ${glow}` : 'inset 0 0 10px rgba(0,0,0,0.7)',
                }
        }
        transition={{ duration: 0.9 }}
      />
      {/* Janela interna que recorta a arte */}
      <div
        className="absolute rotate-45 overflow-hidden rounded-[2px] border bg-black"
        style={{ inset: size * 0.235, borderColor: active ? 'rgba(201,162,95,0.55)' : 'rgba(70,70,76,0.6)' }}
      >
        <div className="absolute left-1/2 top-1/2 h-[142%] w-[142%] max-w-none -translate-x-1/2 -translate-y-1/2 -rotate-45">
          <div className="grid h-full w-full place-items-center">{children}</div>
        </div>
      </div>
      {/* Cravos nos 4 vértices */}
      {(
        [
          { cls: 'left-1/2 -translate-x-1/2', at: { top: size * 0.1 } },
          { cls: 'left-1/2 -translate-x-1/2', at: { bottom: size * 0.1 } },
          { cls: 'top-1/2 -translate-y-1/2', at: { left: size * 0.1 } },
          { cls: 'top-1/2 -translate-y-1/2', at: { right: size * 0.1 } },
        ] as const
      ).map((stud, i) => (
        <span
          key={i}
          className={`absolute rotate-45 border bg-[#1e1e21] ${stud.cls}`}
          style={{
            width: Math.max(5, size * 0.055),
            height: Math.max(5, size * 0.055),
            borderColor: active ? BORDER_GOLD : '#3c3c41',
            ...stud.at,
          }}
        />
      ))}
      {/* Pulso dourado enquanto a luz é canalizada */}
      {charging && (
        <motion.div
          animate={{ opacity: [0.15, 0.75, 0.15] }}
          transition={{ duration: 0.75, repeat: Infinity }}
          className="pointer-events-none absolute -inset-2 z-10"
          style={{
            background: 'radial-gradient(circle, rgba(231,198,130,0.45) 0%, transparent 70%)',
          }}
        />
      )}
      {/* Plaquinha no vértice inferior */}
      {plate && (
        <motion.span
          key={plate}
          initial={{ scale: 1.7, filter: 'brightness(2.2)' }}
          animate={{ scale: 1, filter: 'brightness(1)' }}
          transition={{ type: 'spring', stiffness: 380, damping: 18 }}
          className="absolute bottom-0 left-1/2 z-10 -translate-x-1/2 rounded-[2px] border px-1.5 text-[11px] font-black"
          style={{ borderColor: BORDER_GOLD, background: '#141210', color: GOLD_BRIGHT }}
        >
          {plate}
        </motion.span>
      )}
      {/* Veredito no próprio slot: explosão dourada ou vermelho para dentro */}
      <AnimatePresence>
        {(verdict === 'success' || verdict === 'mixed') && (
          <motion.div
            key={`burst-${verdictKey}`}
            initial={{ opacity: 0, scale: 0.4 }}
            animate={{ opacity: [0, 1, 0], scale: [0.4, 1.5, 2.1] }}
            transition={{ duration: 1 }}
            className="pointer-events-none absolute z-20"
            style={{
              inset: -size * 0.25,
              background:
                'radial-gradient(circle, rgba(231,198,130,0.9) 0%, rgba(201,162,95,0.35) 40%, transparent 70%)',
            }}
          />
        )}
        {verdict === 'fail' && (
          <motion.div
            key={`fail-${verdictKey}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.7, 0] }}
            transition={{ duration: 1.6, times: [0, 0.25, 0.6, 1] }}
            className="pointer-events-none absolute z-20 rotate-45 rounded-[3px]"
            style={{
              inset: size * 0.15,
              boxShadow: `inset 0 0 ${size * 0.22}px ${size * 0.09}px rgba(120,12,12,0.85)`,
              background: 'radial-gradient(circle, transparent 30%, rgba(90,10,10,0.45) 100%)',
            }}
          />
        )}
      </AnimatePresence>
    </Tag>
  );
}

// ============================================================
// Botão principal em bisel (faixa inferior, como na referência)
// ============================================================

export function BevelButton({
  onClick,
  disabled,
  busy,
  busyLabel,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
  busyLabel?: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled || busy}
      className={`w-full rounded-[3px] border py-2.5 text-[15px] font-semibold tracking-wide transition-all ${
        busy
          ? 'cursor-wait border-[#8a6d3b]/50 bg-[#241f16] text-[#c9a25f]'
          : !disabled
            ? 'border-[#8a6d3b] bg-gradient-to-b from-[#3a3325] to-[#241f16] text-[#e7c682] shadow-[inset_0_1px_0_rgba(231,198,130,0.25),0_0_14px_rgba(201,162,95,0.2)] hover:border-[#c9a25f] hover:from-[#4a4030] hover:to-[#2c261a]'
            : 'cursor-not-allowed border-[#3c3c41] bg-[#1a1a1d] text-[#57575c]'
      }`}
    >
      {busy ? (
        <motion.span animate={{ opacity: [1, 0.4, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}>
          {busyLabel ?? children}
        </motion.span>
      ) : (
        children
      )}
    </button>
  );
}
