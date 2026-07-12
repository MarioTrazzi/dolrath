'use client';

import { motion } from 'framer-motion';

interface StatRevealRadarProps {
  str: number;
  agi: number;
  int: number;
  def: number;
}

const AXES: { key: keyof Omit<StatRevealRadarProps, never>; label: string }[] = [
  { key: 'str', label: 'STR' },
  { key: 'agi', label: 'AGI' },
  { key: 'int', label: 'INT' },
  { key: 'def', label: 'DEF' },
];

const SIZE = 220;
const CENTER = SIZE / 2;
const RADIUS = 78;
const GOLD = '#e7c682';
const GOLD_SOFT = 'rgba(231,198,130,0.28)';
const GRID = 'rgba(255,255,255,0.14)';

// Ângulos dos 4 eixos, começando no topo (STR), sentido horário.
function axisPoint(index: number, fraction: number) {
  const angle = -Math.PI / 2 + (index * Math.PI) / 2;
  return {
    x: CENTER + Math.cos(angle) * RADIUS * fraction,
    y: CENTER + Math.sin(angle) * RADIUS * fraction,
  };
}

export function StatRevealRadar({ str, agi, int, def }: StatRevealRadarProps) {
  const values = { str, agi, int, def };
  // Escala dinâmica: acompanha o maior stat rolado (piso 20 cobre a maioria dos rolls).
  const maxScale = Math.max(20, Math.ceil(Math.max(str, agi, int, def) / 5) * 5);

  const dataPoints = AXES.map((axis, i) => axisPoint(i, values[axis.key] / maxScale));
  const dataPath = dataPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';

  const rings = [0.33, 0.66, 1];

  return (
    <div className="flex flex-col items-center">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Distribuição de atributos do personagem">
        {/* Grade recessiva */}
        {rings.map((r) => {
          const ringPoints = AXES.map((_, i) => axisPoint(i, r));
          const ringPath = ringPoints.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ') + ' Z';
          return <path key={r} d={ringPath} fill="none" stroke={GRID} strokeWidth={1} />;
        })}
        {/* Eixos */}
        {AXES.map((_, i) => {
          const p = axisPoint(i, 1);
          return <line key={i} x1={CENTER} y1={CENTER} x2={p.x} y2={p.y} stroke={GRID} strokeWidth={1} />;
        })}

        {/* Forma revelada */}
        <motion.path
          d={dataPath}
          fill={GOLD_SOFT}
          stroke={GOLD}
          strokeWidth={2}
          strokeLinejoin="round"
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.15 }}
          style={{ transformOrigin: `${CENTER}px ${CENTER}px` }}
        />

        {dataPoints.map((p, i) => (
          <motion.circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={4}
            fill={GOLD}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3, delay: 0.5 + i * 0.1 }}
          >
            <title>{`${AXES[i].label}: ${values[AXES[i].key]}`}</title>
          </motion.circle>
        ))}

        {/* Rótulos dos eixos */}
        {AXES.map((axis, i) => {
          const labelPoint = axisPoint(i, 1.22);
          return (
            <text
              key={axis.key}
              x={labelPoint.x}
              y={labelPoint.y}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={12}
              fontWeight={700}
              fill="#c9c9ce"
            >
              {axis.label}
            </text>
          );
        })}
      </svg>

      <div className="grid grid-cols-4 gap-3 mt-2 text-center">
        {AXES.map((axis, i) => (
          <motion.div
            key={axis.key}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.5 + i * 0.1 }}
          >
            <div className="text-[11px] text-text-secondary">{axis.label}</div>
            <div className="text-lg font-bold" style={{ color: GOLD }}>{values[axis.key]}</div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
