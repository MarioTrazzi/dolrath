'use client';

// 🎭 Aparelhos visuais por profissão — a identidade de cada ofício.
//
// bdoTheme.tsx dá a base chumbo+ouro (shell, botões, faixas) e o losango fica
// exclusivo de Encantamento/Alquimia. Aqui vive o GESTO de cada bancada:
//   ⚒  AnvilRig   — bigorna + marteladas + faíscas + têmpera (accent brasa)
//   🍲 StoveRig   — panela na trempe + anel de chama + vapor (accent cobre)
//   ⚙  GrinderRig — funil → engrenagens → bandeja, sem falha (accent aço)
// Cada rig é puramente presentacional: recebe a fase da canalização
// (idle/charging/done, CHARGE_MS de bdoTheme) e os insumos já contados.

import { ReactNode, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { CraftItemThumb as ItemThumb } from '@/components/store/CraftItemThumb';
import { GOLD_BRIGHT, type CraftPhase, type SlotVerdict } from './bdoTheme';

// Paletas de accent (sobre o chumbo; o ouro segue nos botões/títulos)
export const FORGE_ACCENT = '#e0763a';
export const FORGE_ACCENT_BRIGHT = '#ffb15c';
export const COOK_ACCENT = '#c77b4a';
export const COOK_ACCENT_BRIGHT = '#e8a97a';
export const COOK_FLAME = '#e8933a';
export const COOK_GAS = '#6ea8c9';
export const PROC_ACCENT = '#8b97a8';
export const PROC_ACCENT_BRIGHT = '#c2cedd';

export interface RigMaterial {
  name: string;
  emoji: string;
  have: number;
  need: number;
  /** Override explícito da arte (default: /items/<slug>.webp resolvido pelo nome). */
  image?: string;
}

interface RigBaseProps {
  phase: CraftPhase;
  chargeId: number;
  materials: RigMaterial[];
  outputName: string;
  outputEmoji: string;
  /** Override explícito da arte da saída (default: resolvida pelo nome). */
  outputImage?: string;
  /** Glow da raridade da saída. */
  glowColor?: string;
  /** Plaquinha ×N do lote concluído. */
  plate?: string | null;
  /** Canto superior esquerdo: chance / 🔒 / selo. */
  statusNode?: ReactNode;
}

/** Arte de insumo/saída: usa o override quando presente, senão resolve pelo nome. */
function RigArt({
  name,
  emoji,
  image,
  className,
}: {
  name: string;
  emoji: string;
  image?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!image || failed) return <ItemThumb name={name} emoji={emoji} className={className} />;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={image}
      alt={name}
      onError={() => setFailed(true)}
      className="w-full h-full object-cover art-bright"
    />
  );
}

const BOX_W = 320;
const MAT_XS: Record<number, number[]> = {
  1: [160],
  2: [104, 216],
  3: [64, 160, 256],
  4: [48, 123, 197, 272],
};
const xsFor = (n: number) => MAT_XS[n] ?? MAT_XS[4];
const MAT_SIZE = 56;

// ============================================================
// Moldura de insumo (compartilhada, com a forma do ofício)
// ============================================================

function MaterialFrame({
  m,
  charging,
  shape,
  pulseColor,
}: {
  m: RigMaterial;
  charging: boolean;
  /** square = bancada da forja · bowl = tigela da cozinha · chamfer = chapa industrial */
  shape: 'square' | 'bowl' | 'chamfer';
  pulseColor: string;
}) {
  const enough = m.have >= m.need;
  const border = !enough
    ? '#5a2e2e'
    : shape === 'bowl'
      ? '#7a4a2e'
      : shape === 'chamfer'
        ? '#5a6579'
        : '#8a6d3b';
  const bg = !enough
    ? 'linear-gradient(180deg,#241a1a,#100c0c)'
    : shape === 'chamfer'
      ? 'linear-gradient(180deg,#242830,#0f1115)'
      : 'linear-gradient(180deg,#26262a,#101013)';
  const radius = shape === 'bowl' ? 9999 : 3;
  const clip =
    shape === 'chamfer'
      ? 'polygon(18% 0,82% 0,100% 18%,100% 82%,82% 100%,18% 100%,0 82%,0 18%)'
      : undefined;
  return (
    <div className="relative" style={{ width: MAT_SIZE, height: MAT_SIZE }}>
      <div
        className="absolute inset-0 border p-px shadow-[inset_0_0_10px_rgba(0,0,0,0.8)]"
        style={{ borderColor: border, background: bg, borderRadius: radius, clipPath: clip }}
      >
        <span
          className={`block h-full w-full overflow-hidden ${enough ? '' : 'opacity-40 grayscale'}`}
          style={{ borderRadius: radius, clipPath: clip }}
        >
          <RigArt name={m.name} emoji={m.emoji} image={m.image} className="text-xl" />
        </span>
      </div>
      <span
        className={`absolute -bottom-1.5 -right-1.5 z-10 rounded-[2px] border border-black/80 px-1 text-[10px] font-bold ${
          enough ? 'bg-[#101012] text-[#e7c682]' : 'bg-[#1c0f0f] text-red-400'
        }`}
      >
        {m.have}/{m.need}
      </span>
      {charging && (
        <motion.div
          animate={{ opacity: [0.15, 0.7, 0.15] }}
          transition={{ duration: 0.75, repeat: Infinity }}
          className="pointer-events-none absolute -inset-2 z-10"
          style={{ background: `radial-gradient(circle, ${pulseColor} 0%, transparent 70%)` }}
        />
      )}
    </div>
  );
}

/** Plaquinha ×N (mesma linguagem da DiamondSlot). */
function PlateBadge({ plate, borderColor }: { plate: string; borderColor: string }) {
  return (
    <motion.span
      key={plate}
      initial={{ scale: 1.7, filter: 'brightness(2.2)' }}
      animate={{ scale: 1, filter: 'brightness(1)' }}
      transition={{ type: 'spring', stiffness: 380, damping: 18 }}
      className="absolute bottom-0 left-1/2 z-20 -translate-x-1/2 rounded-[2px] border px-1.5 text-[11px] font-black"
      style={{ borderColor, background: '#141210', color: GOLD_BRIGHT }}
    >
      {plate}
    </motion.span>
  );
}

// ============================================================
// ⚒ FORJA — A Bigorna
// ============================================================

// Momentos das 3 marteladas dentro de CHARGE_MS (1600ms)
const STRIKES = [0.31, 0.775, 1.24];
// Vetores das faíscas de cada martelada: [dx, subida, queda]
const SPARK_VECTORS: Array<[number, number, number]> = [
  [-30, 20, 16],
  [-14, 32, 22],
  [18, 26, 18],
  [32, 14, 12],
];

export function AnvilRig({
  phase,
  chargeId,
  verdict = null,
  materials,
  outputName,
  outputEmoji,
  outputImage,
  glowColor,
  plate,
  statusNode,
}: RigBaseProps & { verdict?: SlotVerdict }) {
  const reduced = useReducedMotion();
  const charging = phase === 'charging';
  const xs = xsFor(materials.length);
  const SLOT = 84;
  const PIECE = { x: 160, y: 58 }; // centro da peça sobre a face da bigorna
  const BOX_H = 252;

  return (
    <>
      {/* Brasa no ar atrás da bigorna */}
      <div
        className="pointer-events-none absolute left-1/2 top-10 h-40 w-40 -translate-x-1/2"
        style={{ background: 'radial-gradient(circle, rgba(224,118,58,0.16) 0%, transparent 65%)' }}
      />
      <div className="relative mx-auto" style={{ width: BOX_W, height: BOX_H }}>
        {statusNode && (
          <div className="absolute left-0 top-1 z-10" style={{ width: 92 }}>
            {statusNode}
          </div>
        )}

        {/* Grupo bigorna + peça (treme junto nas marteladas) */}
        <motion.div
          className="absolute inset-0"
          animate={
            charging && !reduced
              ? {
                  y: [0, 0, 2.5, 0, 0, 2.5, 0, 0, 2.5, 0],
                }
              : { y: 0 }
          }
          transition={
            charging && !reduced
              ? { duration: 1.55, times: [0, 0.2, 0.24, 0.32, 0.5, 0.54, 0.62, 0.8, 0.84, 1] }
              : undefined
          }
        >
          {/* A bigorna */}
          <svg
            className="pointer-events-none absolute"
            style={{ left: 85, top: 98 }}
            width={150}
            height={64}
            viewBox="0 0 150 64"
          >
            <defs>
              <linearGradient id="forge-anvil-body" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#3a3a40" />
                <stop offset="1" stopColor="#141416" />
              </linearGradient>
            </defs>
            {/* Face + chifre */}
            <path
              d="M30,4 H128 Q146,4 146,15 V20 H98 L102,34 H58 L62,20 H32 Q8,19 2,9 Q14,4 30,4 Z"
              fill="url(#forge-anvil-body)"
              stroke="#0b0b0d"
              strokeWidth="1"
            />
            {/* Cintura + base */}
            <path d="M58,34 H102 L114,50 H46 Z" fill="url(#forge-anvil-body)" stroke="#0b0b0d" strokeWidth="1" />
            {/* Cepo de madeira */}
            <rect x="40" y="50" width="88" height="13" rx="2" fill="#241b12" stroke="#0b0b0d" />
            <rect x="40" y="53" width="88" height="1.5" fill="rgba(0,0,0,0.5)" />
            {/* Aresta da face: acende em brasa durante a forja */}
            <motion.path
              d="M30,4.8 H130"
              stroke={FORGE_ACCENT_BRIGHT}
              strokeWidth="1.6"
              animate={{ opacity: charging ? 0.85 : 0.25 }}
              transition={{ duration: 0.4 }}
            />
          </svg>

          {/* Brasas subindo da bigorna (ambient) */}
          {!reduced &&
            [0, 1, 2].map((i) => (
              <span
                key={`ember-${i}`}
                className="forge-ember pointer-events-none absolute h-[3px] w-[3px] rounded-full"
                style={{
                  left: 138 + i * 22,
                  top: 116,
                  background: FORGE_ACCENT_BRIGHT,
                  boxShadow: `0 0 6px 2px rgba(224,118,58,0.5)`,
                  animationDelay: `${i * 1.15}s`,
                }}
              />
            ))}

          {/* ◻ A peça na face da bigorna — moldura quadrada de bancada com cravos */}
          <motion.div
            className="absolute"
            style={{ left: PIECE.x - SLOT / 2, top: PIECE.y - SLOT / 2, width: SLOT, height: SLOT }}
            animate={verdict === 'fail' ? { x: [0, -6, 6, -4, 4, -2, 2, 0] } : { x: 0 }}
            transition={{ duration: 0.5 }}
          >
            <motion.div
              className="absolute inset-0 rounded-[3px] border bg-gradient-to-br from-[#2c2620] to-[#141210]"
              animate={
                verdict === 'success' || verdict === 'mixed'
                  ? {
                      borderColor: GOLD_BRIGHT,
                      boxShadow: [
                        `0 0 20px rgba(224,118,58,0.7)`,
                        `0 0 32px rgba(231,198,130,0.95)`,
                        `0 0 16px rgba(201,162,95,0.5)`,
                      ],
                    }
                  : verdict === 'fail'
                    ? {
                        borderColor: '#7a2222',
                        boxShadow: `0 0 14px rgba(120,15,15,0.55)`,
                      }
                    : charging
                      ? {
                          borderColor: FORGE_ACCENT,
                          boxShadow: [
                            `0 0 8px rgba(224,118,58,0.25)`,
                            `0 0 26px rgba(224,118,58,0.75)`,
                          ],
                        }
                      : {
                          borderColor: '#8a6d3b',
                          boxShadow: `0 0 14px ${glowColor ?? 'rgba(201,162,95,0.28)'}`,
                        }
              }
              transition={{ duration: charging ? 1.4 : 0.9 }}
            />
            {/* Cravos nos 4 cantos */}
            {(['-left-[3px] -top-[3px]', '-right-[3px] -top-[3px]', '-left-[3px] -bottom-[3px]', '-right-[3px] -bottom-[3px]'] as const).map(
              (pos) => (
                <span
                  key={pos}
                  className={`absolute z-10 h-[7px] w-[7px] rotate-45 border bg-[#1e1e21] ${pos}`}
                  style={{ borderColor: verdict === 'fail' ? '#7a2222' : '#8a6d3b' }}
                />
              ),
            )}
            {/* Janela da peça */}
            <div className="absolute inset-[7px] overflow-hidden rounded-[2px] border border-black/70 bg-black">
              <div
                className="grid h-full w-full place-items-center"
                style={{
                  opacity: phase === 'done' ? 1 : charging ? 0.85 : 0.5,
                  filter:
                    phase === 'done'
                      ? verdict === 'fail'
                        ? 'grayscale(1) brightness(0.5)'
                        : undefined
                      : 'grayscale(0.8) brightness(0.8)',
                  transition: 'filter 1s ease, opacity 1s ease',
                }}
              >
                <span className="block h-[70%] w-[70%] overflow-hidden">
                  <RigArt name={outputName} emoji={outputEmoji} image={outputImage} className="text-3xl" />
                </span>
              </div>
              {/* Metal incandescendo enquanto o martelo trabalha */}
              <motion.div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    'radial-gradient(circle at 50% 60%, rgba(255,140,50,0.9) 0%, rgba(224,80,20,0.4) 45%, transparent 75%)',
                  mixBlendMode: 'screen',
                }}
                animate={{ opacity: charging ? [0, 0.9] : 0 }}
                transition={charging ? { duration: 1.4, ease: 'easeIn' } : { duration: 0.8 }}
              />
              {/* Rachadura na falha */}
              <AnimatePresence>
                {verdict === 'fail' && (
                  <motion.svg
                    key={`crack-${chargeId}`}
                    className="pointer-events-none absolute inset-0"
                    viewBox="0 0 70 70"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 0.9 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.path
                      d="M34,2 L30,18 L40,30 L28,44 L36,56 L32,68"
                      fill="none"
                      stroke="#dcdce2"
                      strokeWidth="1.4"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.5 }}
                    />
                    <motion.path
                      d="M40,30 L52,36"
                      fill="none"
                      stroke="#dcdce2"
                      strokeWidth="1.1"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 0.3, delay: 0.35 }}
                    />
                  </motion.svg>
                )}
              </AnimatePresence>
            </div>
            {plate && <PlateBadge plate={plate} borderColor="#8a6d3b" />}

            {/* Veredito: explosão dourada (a têmpera) ou vermelho para dentro */}
            <AnimatePresence>
              {(verdict === 'success' || verdict === 'mixed') && (
                <motion.div
                  key={`burst-${chargeId}`}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: [0, 1, 0], scale: [0.4, 1.5, 2.1] }}
                  transition={{ duration: 1 }}
                  className="pointer-events-none absolute z-20"
                  style={{
                    inset: -SLOT * 0.25,
                    background:
                      'radial-gradient(circle, rgba(231,198,130,0.9) 0%, rgba(224,118,58,0.35) 40%, transparent 70%)',
                  }}
                />
              )}
              {verdict === 'fail' && (
                <motion.div
                  key={`failglow-${chargeId}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0.7, 0] }}
                  transition={{ duration: 1.6, times: [0, 0.25, 0.6, 1] }}
                  className="pointer-events-none absolute inset-0 z-20 rounded-[3px]"
                  style={{
                    boxShadow: 'inset 0 0 18px 7px rgba(120,12,12,0.85)',
                    background: 'radial-gradient(circle, transparent 30%, rgba(90,10,10,0.45) 100%)',
                  }}
                />
              )}
            </AnimatePresence>

            {/* Vapor da têmpera no sucesso */}
            <AnimatePresence>
              {(verdict === 'success' || verdict === 'mixed') &&
                !reduced &&
                [0, 1, 2].map((i) => (
                  <motion.span
                    key={`quench-${chargeId}-${i}`}
                    className="pointer-events-none absolute z-20 rounded-full"
                    style={{
                      left: 20 + i * 20,
                      top: -4,
                      width: 9,
                      height: 16,
                      background: 'rgba(255,255,255,0.45)',
                      filter: 'blur(3px)',
                    }}
                    initial={{ opacity: 0, y: 0, scale: 0.7 }}
                    animate={{ opacity: [0, 0.7, 0], y: -30, scale: 1.5 }}
                    transition={{ duration: 1.1, delay: 0.25 + i * 0.18 }}
                  />
                ))}
            </AnimatePresence>
          </motion.div>
        </motion.div>

        {/* 🔨 O martelo (só durante a canalização) */}
        <AnimatePresence>
          {charging && !reduced && (
            <motion.div
              key={`hammer-${chargeId}`}
              className="pointer-events-none absolute z-20"
              style={{ left: 178, top: 6, width: 90, height: 90, transformOrigin: '40px 84px' }}
              initial={{ rotate: 26, opacity: 0 }}
              animate={{
                rotate: [26, 26, -52, 26, -52, 26, -52, -40],
                opacity: [0, 1, 1, 1, 1, 1, 1, 0],
              }}
              exit={{ opacity: 0 }}
              transition={{ duration: 1.55, times: [0, 0.06, 0.2, 0.36, 0.5, 0.66, 0.8, 1] }}
            >
              <svg width="90" height="90" viewBox="0 0 90 90">
                <defs>
                  <linearGradient id="forge-hammer-head" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0" stopColor="#4a4a52" />
                    <stop offset="1" stopColor="#1c1c20" />
                  </linearGradient>
                </defs>
                <rect x="36" y="24" width="8" height="60" rx="3" fill="#4a3826" stroke="#0b0b0d" />
                <rect x="16" y="4" width="48" height="22" rx="4" fill="url(#forge-hammer-head)" stroke="#0b0b0d" />
                <rect x="16" y="7" width="48" height="2" fill="rgba(255,177,92,0.35)" />
              </svg>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Clarões e faíscas de cada martelada */}
        {charging &&
          !reduced &&
          STRIKES.map((t, s) => (
            <motion.div
              key={`flash-${chargeId}-${s}`}
              className="pointer-events-none absolute z-10"
              style={{
                left: PIECE.x - 40,
                top: PIECE.y - 40,
                width: 80,
                height: 80,
                background: 'radial-gradient(circle, rgba(255,244,220,0.95) 0%, rgba(255,177,92,0.4) 40%, transparent 70%)',
              }}
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.95, 0] }}
              transition={{ delay: t, duration: 0.24 }}
            />
          ))}
        {charging &&
          !reduced &&
          STRIKES.flatMap((t, s) =>
            SPARK_VECTORS.map(([dx, up, fall], i) => (
              <motion.span
                key={`spark-${chargeId}-${s}-${i}`}
                className="pointer-events-none absolute z-20 h-[3px] w-[3px] rounded-full"
                style={{
                  background: FORGE_ACCENT_BRIGHT,
                  boxShadow: '0 0 6px 2px rgba(255,177,92,0.8)',
                }}
                initial={{ left: PIECE.x, top: PIECE.y, opacity: 0 }}
                animate={{
                  left: [PIECE.x, PIECE.x + dx * 0.6, PIECE.x + dx],
                  top: [PIECE.y, PIECE.y - up, PIECE.y + fall],
                  opacity: [0, 1, 0],
                }}
                transition={{ delay: t + 0.02, duration: 0.55, times: [0, 0.45, 1] }}
              />
            )),
          )}

        {/* A bancada de metal riscado onde os materiais descansam */}
        <div
          className="absolute left-0 right-0"
          style={{
            top: 222,
            height: 14,
            background:
              'repeating-linear-gradient(100deg, rgba(255,255,255,0.035) 0 2px, transparent 2px 7px), linear-gradient(180deg,#2e2e33,#1a1a1e)',
            borderTop: '1px solid #46464c',
            borderBottom: '1px solid #000',
          }}
        >
          {[14, 118, 202, 306].map((x) => (
            <span
              key={x}
              className="absolute top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full"
              style={{ left: x, background: '#57575e', boxShadow: 'inset 0 -1px 1px #000' }}
            />
          ))}
        </div>

        {/* Materiais enfileirados na bancada */}
        {materials.map((m, i) => (
          <div key={m.name} className="absolute" style={{ left: xs[i] - MAT_SIZE / 2, top: 166 }}>
            <MaterialFrame m={m} charging={charging} shape="square" pulseColor="rgba(255,177,92,0.5)" />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes forge-ember-rise {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          15% { opacity: 0.55; }
          100% { transform: translateY(-46px) scale(0.4); opacity: 0; }
        }
        .forge-ember { animation: forge-ember-rise 3.4s ease-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .forge-ember { animation: none; opacity: 0; }
        }
      `}</style>
    </>
  );
}

// ============================================================
// 🍲 CULINÁRIA — O Fogão
// ============================================================

export function StoveRig({
  phase,
  chargeId,
  materials,
  outputName,
  outputEmoji,
  outputImage,
  glowColor,
  plate,
  statusNode,
}: RigBaseProps) {
  const reduced = useReducedMotion();
  const charging = phase === 'charging';
  const done = phase === 'done';
  const xs = xsFor(materials.length);
  const POT = { x: 160, y: 88 };
  const POT_D = 116;
  const RING_D = 150;
  const BOX_H = 260;
  const annulusMask =
    'radial-gradient(closest-side, transparent 58%, black 64%, black 90%, transparent 97%)';

  return (
    <>
      {/* Calor de cobre atrás da panela */}
      <div
        className="pointer-events-none absolute left-1/2 top-8 h-44 w-44 -translate-x-1/2"
        style={{ background: 'radial-gradient(circle, rgba(199,123,74,0.15) 0%, transparent 65%)' }}
      />
      <div className="relative mx-auto" style={{ width: BOX_W, height: BOX_H }}>
        {statusNode && (
          <div className="absolute left-0 top-1 z-10" style={{ width: 92 }}>
            {statusNode}
          </div>
        )}

        {/* Anel de chama da trempe (gás em idle, fogo alto ao cozinhar) */}
        <div
          className={reduced ? undefined : 'cook-flame-spin'}
          style={{
            position: 'absolute',
            left: POT.x - RING_D / 2,
            top: POT.y - RING_D / 2,
            width: RING_D,
            height: RING_D,
            pointerEvents: 'none',
          }}
        >
          {/* chama de gás (idle) */}
          <div
            className="absolute inset-0 rounded-full transition-opacity duration-500"
            style={{
              background:
                'repeating-conic-gradient(from 0deg, transparent 0deg 8deg, rgba(110,168,201,0.4) 12deg, rgba(110,168,201,0.12) 16deg, transparent 22deg)',
              WebkitMaskImage: annulusMask,
              maskImage: annulusMask,
              filter: 'blur(1px)',
              opacity: charging ? 0.15 : 0.8,
            }}
          />
          {/* fogo alto (cozinhando) */}
          <div
            className="absolute inset-0 rounded-full transition-opacity duration-500"
            style={{
              background:
                'repeating-conic-gradient(from 0deg, transparent 0deg 6deg, rgba(232,147,58,0.8) 11deg, rgba(255,177,92,0.95) 14deg, rgba(232,147,58,0.25) 18deg, transparent 24deg)',
              WebkitMaskImage: annulusMask,
              maskImage: annulusMask,
              filter: 'blur(1.5px)',
              opacity: charging ? 1 : 0,
            }}
          />
        </div>

        {/* Braços da trempe */}
        <svg
          className="pointer-events-none absolute"
          style={{ left: POT.x - 75, top: POT.y - 75 }}
          width="150"
          height="150"
          viewBox="0 0 150 150"
        >
          {[45, 135, 225, 315].map((a) => (
            <rect
              key={a}
              x="71"
              y="6"
              width="8"
              height="30"
              rx="3"
              fill="#232327"
              stroke="#0b0b0d"
              transform={`rotate(${a} 75 75)`}
            />
          ))}
        </svg>

        {/* 🍲 A panela (vista de cima, borda de cobre) */}
        <motion.div
          className="absolute rounded-full p-[3px]"
          style={{
            left: POT.x - POT_D / 2,
            top: POT.y - POT_D / 2,
            width: POT_D,
            height: POT_D,
            background: 'linear-gradient(140deg,#8a5a38,#c77b4a 45%,#5b3722)',
          }}
          animate={{
            boxShadow: done
              ? [
                  `0 0 16px rgba(199,123,74,0.4)`,
                  `0 0 34px rgba(231,198,130,0.9)`,
                  `0 0 18px ${glowColor ?? 'rgba(199,123,74,0.5)'}`,
                ]
              : charging
                ? ['0 0 12px rgba(232,147,58,0.3)', '0 0 30px rgba(232,147,58,0.7)']
                : `0 4px 18px rgba(0,0,0,0.7), 0 0 12px ${glowColor ?? 'rgba(199,123,74,0.35)'}`,
          }}
          transition={{ duration: charging ? 1.4 : 0.9 }}
        >
          {/* Alças */}
          <span
            className="absolute -left-[11px] top-1/2 h-[7px] w-[14px] -translate-y-1/2 rounded-full"
            style={{ background: 'linear-gradient(180deg,#c77b4a,#5b3722)', border: '1px solid #0b0b0d' }}
          />
          <span
            className="absolute -right-[11px] top-1/2 h-[7px] w-[14px] -translate-y-1/2 rounded-full"
            style={{ background: 'linear-gradient(180deg,#c77b4a,#5b3722)', border: '1px solid #0b0b0d' }}
          />
          <div className="relative h-full w-full overflow-hidden rounded-full bg-[#0d0d0f]">
            <div
              className="grid h-full w-full place-items-center"
              style={{
                opacity: done ? 1 : charging ? 0.75 : 0.5,
                filter: done ? undefined : 'grayscale(0.8) brightness(0.8)',
                transition: 'filter 1s ease, opacity 1s ease',
              }}
            >
              <span className="block h-[62%] w-[62%] overflow-hidden">
                <RigArt name={outputName} emoji={outputEmoji} image={outputImage} className="text-3xl" />
              </span>
            </div>
            {/* Caldo borbulhando */}
            {charging &&
              !reduced &&
              [0, 1, 2].map((i) => (
                <span
                  key={`bubble-${chargeId}-${i}`}
                  className="cook-bubble absolute rounded-full"
                  style={{
                    left: 38 + i * 18,
                    bottom: 12,
                    width: 6,
                    height: 6,
                    background: 'rgba(255,255,255,0.35)',
                    animationDelay: `${i * 0.35}s`,
                  }}
                />
              ))}
          </div>
          {plate && <PlateBadge plate={plate} borderColor="#7a4a2e" />}

          {/* Prato servido: brilho dourado sobre a panela */}
          <AnimatePresence>
            {done && (
              <motion.div
                key={`serve-${chargeId}`}
                initial={{ opacity: 0, scale: 0.4 }}
                animate={{ opacity: [0, 1, 0], scale: [0.4, 1.4, 1.9] }}
                transition={{ duration: 1 }}
                className="pointer-events-none absolute z-20 rounded-full"
                style={{
                  inset: -POT_D * 0.2,
                  background:
                    'radial-gradient(circle, rgba(231,198,130,0.85) 0%, rgba(232,147,58,0.3) 45%, transparent 70%)',
                }}
              />
            )}
          </AnimatePresence>
        </motion.div>

        {/* Vapor da panela */}
        {charging &&
          !reduced &&
          [0, 1, 2].map((i) => (
            <span
              key={`steam-${chargeId}-${i}`}
              className="cook-steam pointer-events-none absolute rounded-full"
              style={{
                left: 142 + i * 16,
                top: 16,
                width: 10,
                height: 18,
                background: 'rgba(255,255,255,0.4)',
                filter: 'blur(4px)',
                animationDelay: `${i * 0.5}s`,
              }}
            />
          ))}
        {/* Aroma dourado ao servir */}
        <AnimatePresence>
          {done &&
            !reduced &&
            [0, 1, 2, 3].map((i) => (
              <motion.span
                key={`aroma-${chargeId}-${i}`}
                className="pointer-events-none absolute z-20 rounded-full"
                style={{
                  left: 136 + i * 14,
                  top: 20,
                  width: 8,
                  height: 15,
                  background: 'rgba(231,198,130,0.55)',
                  filter: 'blur(3px)',
                }}
                initial={{ opacity: 0, y: 0, scale: 0.7 }}
                animate={{ opacity: [0, 0.8, 0], y: -34, scale: 1.4 }}
                transition={{ duration: 1.3, delay: 0.2 + i * 0.15 }}
              />
            ))}
        </AnimatePresence>

        {/* Ingredientes pulando para a panela */}
        {charging &&
          !reduced &&
          materials.map((m, i) => (
            <motion.span
              key={`toss-${chargeId}-${m.name}`}
              className="pointer-events-none absolute z-20 grid h-8 w-8 -translate-x-1/2 -translate-y-1/2 place-items-center"
              initial={{ left: xs[i], top: 178, opacity: 0, scale: 1 }}
              animate={{
                left: [xs[i], (xs[i] + POT.x) / 2, POT.x],
                top: [178, 34, POT.y - 10],
                opacity: [0, 1, 0.15],
                scale: [1, 0.95, 0.4],
              }}
              transition={{
                delay: 0.12 + i * 0.18,
                duration: 0.85,
                times: [0, 0.5, 1],
                ease: 'easeIn',
              }}
            >
              <span className="text-xl">{m.emoji}</span>
            </motion.span>
          ))}

        {/* A tábua de corte onde os ingredientes esperam */}
        <div
          className="absolute left-0 right-0"
          style={{
            top: 218,
            height: 16,
            background:
              'repeating-linear-gradient(90deg, rgba(0,0,0,0.28) 0 1px, transparent 1px 26px), linear-gradient(180deg,#3a2a1c,#241a10)',
            borderTop: '1px solid #55402c',
            borderBottom: '1px solid #000',
          }}
        />

        {/* Tigelinhas de ingrediente sobre a tábua */}
        {materials.map((m, i) => (
          <div key={m.name} className="absolute" style={{ left: xs[i] - MAT_SIZE / 2, top: 162 }}>
            <MaterialFrame m={m} charging={charging} shape="bowl" pulseColor="rgba(232,147,58,0.5)" />
          </div>
        ))}
      </div>
      <style>{`
        @keyframes cook-flame-spin { to { transform: rotate(360deg); } }
        .cook-flame-spin { animation: cook-flame-spin 7s linear infinite; }
        @keyframes cook-steam-rise {
          0% { transform: translateY(0) translateX(0) scale(0.7); opacity: 0; }
          20% { opacity: 0.55; }
          100% { transform: translateY(-42px) translateX(7px) scale(1.5); opacity: 0; }
        }
        .cook-steam { animation: cook-steam-rise 1.7s ease-out infinite; }
        @keyframes cook-bubble-rise {
          0% { transform: translateY(0) scale(0.6); opacity: 0; }
          30% { opacity: 0.7; }
          100% { transform: translateY(-46px) scale(1.1); opacity: 0; }
        }
        .cook-bubble { animation: cook-bubble-rise 1.1s ease-in infinite; }
        @media (prefers-reduced-motion: reduce) {
          .cook-flame-spin { animation: none; }
          .cook-steam, .cook-bubble { animation: none; opacity: 0; }
        }
      `}</style>
    </>
  );
}

// ============================================================
// ⚙ PROCESSAMENTO — O Triturador
// ============================================================

/** Polígono de engrenagem estilizada centrada em (0,0). */
function gearPoints(r: number, teeth: number, toothH: number): string {
  const pts: string[] = [];
  const steps = teeth * 2;
  const half = Math.PI / steps;
  for (let i = 0; i < steps; i++) {
    const rr = i % 2 === 0 ? r + toothH : r;
    const mid = i * 2 * half;
    for (const a of [mid - half * 0.55, mid + half * 0.55]) {
      pts.push(`${(rr * Math.cos(a)).toFixed(1)},${(rr * Math.sin(a)).toFixed(1)}`);
    }
  }
  return pts.join(' ');
}

function GearSvg({
  size,
  r,
  teeth,
  className,
  duration,
}: {
  size: number;
  r: number;
  teeth: number;
  className: string;
  duration: string;
}) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox={`${-size / 2} ${-size / 2} ${size} ${size}`}
      style={{ animationDuration: duration }}
    >
      <polygon
        points={gearPoints(r, teeth, r * 0.22)}
        fill="url(#proc-gear-grad)"
        stroke="#0b0b0d"
        strokeWidth="1"
      />
      <circle r={r * 0.42} fill="#171a20" stroke="#0b0b0d" />
      <circle r={r * 0.14} fill="#3a4250" stroke="#0b0b0d" />
    </svg>
  );
}

/** Selo industrial do refino garantido (canto de status do triturador). */
export function NoFailSeal() {
  return (
    <div className="grid place-items-center pt-1">
      <div
        className="-rotate-6 border px-1.5 py-0.5 text-[10px] font-black uppercase tracking-[0.18em]"
        style={{
          color: PROC_ACCENT_BRIGHT,
          borderColor: 'rgba(194,206,221,0.7)',
          boxShadow: 'inset 0 0 0 1px rgba(11,11,13,0.9), inset 0 0 0 2px rgba(194,206,221,0.35)',
          background: 'rgba(139,151,168,0.08)',
        }}
      >
        Sem falha
      </div>
    </div>
  );
}

export function GrinderRig({
  phase,
  chargeId,
  materials,
  outputName,
  outputEmoji,
  outputImage,
  glowColor,
  plate,
  statusNode,
}: RigBaseProps) {
  const reduced = useReducedMotion();
  const charging = phase === 'charging';
  const done = phase === 'done';
  const xs = xsFor(materials.length);
  const BOX_H = 268;
  const HEX = { w: 92, h: 84, x: 160, y: 210 };
  const hexClip = 'polygon(25% 0,75% 0,100% 50%,75% 100%,25% 100%,0 50%)';

  return (
    <>
      {/* Luz fria de oficina atrás da máquina */}
      <div
        className="pointer-events-none absolute left-1/2 top-16 h-40 w-40 -translate-x-1/2"
        style={{ background: 'radial-gradient(circle, rgba(139,151,168,0.12) 0%, transparent 65%)' }}
      />
      <div className="relative mx-auto" style={{ width: BOX_W, height: BOX_H }}>
        {statusNode && (
          <div className="absolute left-0 z-10" style={{ top: 66, width: 88 }}>
            {statusNode}
          </div>
        )}

        {/* Insumos crus na boca da máquina */}
        {materials.map((m, i) => (
          <div key={m.name} className="absolute" style={{ left: xs[i] - MAT_SIZE / 2, top: 2 }}>
            <MaterialFrame m={m} charging={charging} shape="chamfer" pulseColor="rgba(194,206,221,0.45)" />
          </div>
        ))}

        {/* O funil */}
        <svg
          className="pointer-events-none absolute"
          style={{ left: 85, top: 62 }}
          width="150"
          height="48"
          viewBox="0 0 150 48"
        >
          <defs>
            <linearGradient id="proc-funnel-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#39414e" />
              <stop offset="1" stopColor="#181c23" />
            </linearGradient>
            <linearGradient id="proc-gear-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#4a5464" />
              <stop offset="1" stopColor="#20242c" />
            </linearGradient>
          </defs>
          <path d="M5,8 H145 L94,44 H56 Z" fill="url(#proc-funnel-grad)" stroke="#0b0b0d" />
          <rect x="0" y="0" width="150" height="9" rx="2" fill="#3a4250" stroke="#0b0b0d" />
          <rect x="4" y="2.5" width="142" height="1.5" fill="rgba(194,206,221,0.25)" />
        </svg>

        {/* Carcaça da máquina (vibra enquanto tritura) */}
        <motion.div
          className="absolute border"
          style={{
            left: 96,
            top: 104,
            width: 128,
            height: 70,
            borderColor: '#3a4250',
            background:
              'repeating-linear-gradient(0deg, rgba(255,255,255,0.025) 0 1px, transparent 1px 5px), linear-gradient(180deg,#262b34,#14171d)',
            borderRadius: 3,
            boxShadow: 'inset 0 0 14px rgba(0,0,0,0.8)',
          }}
          animate={charging && !reduced ? { x: [0, -1, 1, 0] } : { x: 0 }}
          transition={charging && !reduced ? { duration: 0.18, repeat: Infinity } : undefined}
        >
          {/* Rebites */}
          {(['left-1 top-1', 'right-1 top-1', 'left-1 bottom-1', 'right-1 bottom-1'] as const).map((pos) => (
            <span
              key={pos}
              className={`absolute h-[5px] w-[5px] rounded-full ${pos}`}
              style={{ background: '#5a6579', boxShadow: 'inset 0 -1px 1px #000' }}
            />
          ))}
          {/* As engrenagens engrenadas */}
          <div className="absolute" style={{ left: 14, top: 3 }}>
            <GearSvg
              size={68}
              r={26}
              teeth={9}
              className={reduced ? '' : 'proc-gear-a'}
              duration={charging ? '1.3s' : '12s'}
            />
          </div>
          <div className="absolute" style={{ left: 68, top: 22 }}>
            <GearSvg
              size={48}
              r={18}
              teeth={7}
              className={reduced ? '' : 'proc-gear-b'}
              duration={charging ? '0.9s' : '8.4s'}
            />
          </div>
          {/* Pedaços caindo do funil nas engrenagens */}
          {charging &&
            !reduced &&
            [0, 1, 2, 3].map((i) => (
              <span
                key={`debris-${chargeId}-${i}`}
                className="proc-debris absolute"
                style={{
                  left: 52 + i * 8,
                  top: -4,
                  width: 4,
                  height: 4,
                  background: '#9aa4b4',
                  animationDelay: `${i * 0.18}s`,
                }}
              />
            ))}
        </motion.div>

        {/* ⬡ O produto beneficiado (porca de aço) */}
        <div
          className="absolute"
          style={{ left: HEX.x - HEX.w / 2, top: HEX.y - HEX.h / 2, width: HEX.w, height: HEX.h }}
        >
          <motion.div
            className="absolute inset-0"
            style={{ clipPath: hexClip, background: 'linear-gradient(180deg,#4a5464,#20242c)' }}
            animate={{
              filter: done
                ? [
                    'drop-shadow(0 0 6px rgba(194,206,221,0.3))',
                    'drop-shadow(0 0 18px rgba(231,198,130,0.8))',
                    `drop-shadow(0 0 10px ${glowColor ?? 'rgba(194,206,221,0.5)'})`,
                  ]
                : `drop-shadow(0 0 8px ${glowColor ?? 'rgba(139,151,168,0.35)'})`,
            }}
            transition={{ duration: 0.9 }}
          />
          <div
            className="absolute inset-[4px] overflow-hidden bg-[#0d0e11]"
            style={{ clipPath: hexClip }}
          >
            <motion.div
              key={`drop-${chargeId}-${phase === 'done' ? 'done' : 'wait'}`}
              className="grid h-full w-full place-items-center"
              initial={done ? { y: -36, opacity: 0, scale: 0.7 } : false}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ type: 'spring', stiffness: 420, damping: 17 }}
              style={{
                opacity: done ? 1 : charging ? 0.6 : 0.5,
                filter: done ? undefined : 'grayscale(0.8) brightness(0.8)',
                transition: 'filter 1s ease',
              }}
            >
              <span className="block h-[58%] w-[58%] overflow-hidden">
                <RigArt name={outputName} emoji={outputEmoji} image={outputImage} className="text-3xl" />
              </span>
            </motion.div>
          </div>
          {/* Parafusos nos 6 vértices */}
          {[
            [25, 0],
            [75, 0],
            [100, 50],
            [75, 100],
            [25, 100],
            [0, 50],
          ].map(([px, py]) => (
            <span
              key={`${px}-${py}`}
              className="absolute h-[6px] w-[6px] -translate-x-1/2 -translate-y-1/2 rounded-full border"
              style={{
                left: `${px}%`,
                top: `${py}%`,
                background: '#3a4250',
                borderColor: '#5a6579',
              }}
            />
          ))}
          {plate && <PlateBadge plate={plate} borderColor="#5a6579" />}
          {/* Baforada de poeira quando o produto assenta */}
          <AnimatePresence>
            {done &&
              !reduced &&
              [0, 1].map((i) => (
                <motion.div
                  key={`dust-${chargeId}-${i}`}
                  className="pointer-events-none absolute rounded-full"
                  style={{
                    left: i === 0 ? 2 : 58,
                    bottom: -4,
                    width: 30,
                    height: 14,
                    background: 'rgba(154,164,180,0.35)',
                    filter: 'blur(5px)',
                  }}
                  initial={{ opacity: 0, scale: 0.4 }}
                  animate={{ opacity: [0, 0.6, 0], scale: [0.4, 1.5, 1.9], x: i === 0 ? -12 : 12 }}
                  transition={{ duration: 0.7, delay: 0.12 }}
                />
              ))}
          </AnimatePresence>
        </div>

        {/* Bandeja de recolha */}
        <div
          className="absolute"
          style={{
            left: 106,
            top: 254,
            width: 108,
            height: 10,
            background: 'linear-gradient(180deg,#2b313c,#14171d)',
            border: '1px solid #3a4250',
            borderRadius: 2,
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
          }}
        />
      </div>
      <style>{`
        @keyframes proc-spin { to { transform: rotate(360deg); } }
        @keyframes proc-spin-rev { to { transform: rotate(-360deg); } }
        .proc-gear-a { animation-name: proc-spin; animation-timing-function: linear; animation-iteration-count: infinite; }
        .proc-gear-b { animation-name: proc-spin-rev; animation-timing-function: linear; animation-iteration-count: infinite; }
        @keyframes proc-debris-fall {
          0% { transform: translateY(0); opacity: 0; }
          15% { opacity: 0.85; }
          100% { transform: translateY(30px); opacity: 0; }
        }
        .proc-debris { animation: proc-debris-fall 0.7s ease-in infinite; }
        @media (prefers-reduced-motion: reduce) {
          .proc-gear-a, .proc-gear-b, .proc-debris { animation: none; }
          .proc-debris { opacity: 0; }
        }
      `}</style>
    </>
  );
}
