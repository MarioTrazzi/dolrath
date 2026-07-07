'use client';

// 🧪 Mock da AlchemyDialog — verificação visual SEM banco (padrão dev/*).
// Knobs: nível de Alquimia (gating/chance), resultado forçado (sucesso/falha/
// misto/aleatório) e gold. O inventário é fake e desconta a cada transmutação.

import { useMemo, useRef, useState } from 'react';
import AlchemyDialog, {
  type AlchemyCraftResult,
  type AlchemyInventoryItem,
} from '@/components/crafting/AlchemyDialog';
import { getRecipeById } from '@/lib/alchemy';
import { getCraftChance, getCraftXp, rollCraftBatch } from '@/lib/craftingProfession';
import { getProfessionLevelInfo, professionXpForLevel } from '@/lib/professionSystem';

type Forced = 'random' | 'success' | 'fail' | 'mixed';

const START_INV: [string, number][] = [
  ['Erva Medicinal', 20],
  ['Água Pura', 15],
  ['Flor de Mana', 10],
  ['Raiz Vigorosa', 8],
  ['Seiva Ancestral', 5],
  ['Cogumelo Lunar', 4],
  ['Pó de Osso', 4],
  ['Cristal de Mana', 2],
  ['Glândula de Veneno', 3],
  ['Lótus Negra', 2],
  ['Essência Cristalina', 1],
  ['Sangue de Monstro', 2],
  ['Pena de Fênix', 1],
  ['Trigo', 6],
  ['Fibra de Linho', 6],
];

export default function AlchemyDialogMockPage() {
  const [open, setOpen] = useState(true);
  const [level, setLevel] = useState(8);
  const [forced, setForced] = useState<Forced>('random');
  const [gold, setGold] = useState(5000);
  const [bonusXp, setBonusXp] = useState(0);
  const invRef = useRef(new Map<string, number>(START_INV));
  // Remonta a dialog quando os knobs estruturais mudam.
  const dialogKey = useMemo(() => `${level}`, [level]);

  const xp = professionXpForLevel(level) + bonusXp;

  const fetchInventoryOverride = async (): Promise<AlchemyInventoryItem[]> =>
    Array.from(invRef.current.entries())
      .filter(([, q]) => q > 0)
      .map(([name, quantity], i) => ({
        id: `mock-${i}`,
        quantity,
        item: { name, type: 'CONSUMABLE', stats: { kind: 'ingredient' } },
      }));

  const attemptOverride = async (recipeId: string, quantity: number): Promise<AlchemyCraftResult> => {
    await new Promise((r) => setTimeout(r, 600)); // latência fake do servidor
    const recipe = getRecipeById(recipeId)!;
    const info = getProfessionLevelInfo(xp);
    let roll = rollCraftBatch(recipe.rarity, info.level, quantity);
    if (forced === 'success') roll = { ...roll, succeeded: quantity, failed: 0 };
    if (forced === 'fail') roll = { ...roll, succeeded: 0, failed: quantity };
    if (forced === 'mixed' && quantity > 1) {
      const s = Math.max(1, Math.floor(quantity / 2));
      roll = { ...roll, succeeded: s, failed: quantity - s };
    }
    roll = {
      ...roll,
      xpGained:
        roll.succeeded * getCraftXp(recipe.rarity, true) + roll.failed * getCraftXp(recipe.rarity, false),
    };
    // Consome inventário/gold fake (falha também consome).
    for (const ing of recipe.ingredients) {
      invRef.current.set(ing.name, (invRef.current.get(ing.name) ?? 0) - ing.quantity * quantity);
    }
    setGold((g) => g - recipe.goldCost * quantity);
    setBonusXp((b) => b + roll.xpGained);
    const message =
      roll.failed === 0
        ? `⚗️ ${roll.attempted > 1 ? `${roll.attempted}× ` : ''}${recipe.outputName} criada${roll.attempted > 1 ? 's' : ''} com sucesso!`
        : roll.succeeded === 0
          ? `💥 A transmutação falhou${roll.attempted > 1 ? ` ${roll.attempted}×` : ''} — os ingredientes se perderam.`
          : `⚗️ ${roll.succeeded} de ${roll.attempted} ${recipe.outputName} sobreviveram ao caldeirão.`;
    return {
      attempted: roll.attempted,
      succeeded: roll.succeeded,
      failed: roll.failed,
      chance: getCraftChance(recipe.rarity, info.level),
      xpGained: roll.xpGained,
      levelInfo: getProfessionLevelInfo(xp + roll.xpGained),
      characterGold: gold - recipe.goldCost * quantity,
      outputName: recipe.outputName,
      rarity: recipe.rarity,
      message,
    };
  };

  return (
    <div className="min-h-dvh bg-[#0c0c0e] p-6 text-white">
      <h1 className="mb-4 text-xl font-black">🧪 Mock — AlchemyDialog (estilo BDO)</h1>
      <div className="mb-6 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Nível de Alquimia
          <input
            type="range"
            min={1}
            max={50}
            value={level}
            onChange={(e) => {
              setLevel(Number(e.target.value));
              setBonusXp(0);
            }}
          />
          <b className="text-amber-300">{level}</b>
        </label>
        <label className="flex items-center gap-2">
          Resultado
          <select
            value={forced}
            onChange={(e) => setForced(e.target.value as Forced)}
            className="rounded border border-white/20 bg-black/40 px-2 py-1"
          >
            <option value="random">🎲 aleatório (chance real)</option>
            <option value="success">✨ forçar sucesso</option>
            <option value="fail">💥 forçar falha</option>
            <option value="mixed">⚖️ forçar lote misto</option>
          </select>
        </label>
        <span>
          Gold: <b className="text-amber-300">{gold}</b>
        </span>
        <button
          onClick={() => setOpen(true)}
          className="rounded border border-amber-500/50 bg-amber-950/40 px-3 py-1 font-semibold"
        >
          Abrir dialog
        </button>
        <button
          onClick={() => {
            invRef.current = new Map(START_INV);
            setGold(5000);
            setBonusXp(0);
          }}
          className="rounded border border-white/20 bg-white/5 px-3 py-1"
        >
          Resetar inventário
        </button>
      </div>
      <p className="max-w-xl text-xs text-white/40">
        Teste: montar receita clicando nos ingredientes, livro de receitas (🔒 por nível), lote com
        placar misto, deep-link não se aplica aqui. Nível &lt; 5 bloqueia incomuns; &lt; 12 raras; &lt; 20 épicas.
      </p>

      <AlchemyDialog
        key={dialogKey}
        open={open}
        onClose={() => setOpen(false)}
        characterGold={gold}
        fetchInfoOverride={async () => ({ xp, levelInfo: getProfessionLevelInfo(xp) })}
        fetchInventoryOverride={fetchInventoryOverride}
        attemptOverride={attemptOverride}
      />
    </div>
  );
}
