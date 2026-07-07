'use client';

// 🧪 Mock da ForgeDialog — verificação visual SEM banco (padrão dev/*).
// Knobs: nível de Forja (gating/chance), resultado forçado e gold. Inventário
// fake de materiais desconta a cada forja (falha também consome).

import { useMemo, useRef, useState } from 'react';
import ForgeDialog, {
  type ForgeCraftResult,
  type ForgeInventoryItem,
} from '@/components/crafting/ForgeDialog';
import { getForgeRecipeById } from '@/lib/forge';
import {
  getCraftChance,
  getCraftXp,
  isRefineRecipe,
  refineXpAndLevel,
  rollCraftBatch,
} from '@/lib/craftingProfession';
import { getProfessionLevelInfo, professionXpForLevel } from '@/lib/professionSystem';

type Forced = 'random' | 'success' | 'fail' | 'mixed';

const START_INV: [string, number][] = [
  ['Couro', 12],
  ['Ferro', 8],
  ['Ferro Pesado', 6],
  ['Metal Leve', 4],
  ['Madeira Flexível', 4],
  ['Seiva de Ent', 4],
  ['Cristal Bruto', 4],
  ['Fragmentos de Joias', 4],
  ['Fibra de Linho', 8],
  ['Estilhaço de Pedra Negra (Arma)', 25],
  ['Estilhaço de Pedra Negra (Armadura)', 25],
  ['Pedra Negra (Arma)', 12],
];

export default function ForgeDialogMockPage() {
  const [open, setOpen] = useState(true);
  const [level, setLevel] = useState(6);
  const [forced, setForced] = useState<Forced>('random');
  const [gold, setGold] = useState(8000);
  const [bonusXp, setBonusXp] = useState(0);
  const invRef = useRef(new Map<string, number>(START_INV));
  const dialogKey = useMemo(() => `${level}`, [level]);

  const xp = professionXpForLevel(level) + bonusXp;

  const fetchInventoryOverride = async (): Promise<ForgeInventoryItem[]> =>
    Array.from(invRef.current.entries())
      .filter(([, q]) => q > 0)
      .map(([name, quantity], i) => ({
        id: `mock-${i}`,
        quantity,
        item: { name, type: 'CONSUMABLE', stats: { kind: 'material' } },
      }));

  const attemptOverride = async (recipeId: string, quantity: number): Promise<ForgeCraftResult> => {
    await new Promise((r) => setTimeout(r, 600)); // latência fake do servidor
    const recipe = getForgeRecipeById(recipeId)!;
    const info = getProfessionLevelInfo(xp);
    const refine = isRefineRecipe(recipe);
    let roll = refine
      ? {
          attempted: quantity,
          succeeded: quantity,
          failed: 0,
          xpGained: refineXpAndLevel(recipe.rarity).xp * quantity,
          chance: 1,
        }
      : rollCraftBatch(recipe.rarity, info.level, quantity);
    if (!refine) {
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
    }
    for (const m of recipe.materials) {
      invRef.current.set(m.name, (invRef.current.get(m.name) ?? 0) - m.quantity * quantity);
    }
    setGold((g) => g - recipe.goldCost * quantity);
    setBonusXp((b) => b + roll.xpGained);
    const message =
      roll.failed === 0
        ? `⚒️ ${roll.attempted > 1 ? `${roll.attempted}× ` : ''}${recipe.outputName} forjado${roll.attempted > 1 ? 's' : ''} com sucesso!`
        : roll.succeeded === 0
          ? `💥 A forja falhou${roll.attempted > 1 ? ` ${roll.attempted}×` : ''} — os materiais se perderam no fogo.`
          : `⚒️ ${roll.succeeded} de ${roll.attempted} ${recipe.outputName} sobreviveram à forja.`;
    return {
      attempted: roll.attempted,
      succeeded: roll.succeeded,
      failed: roll.failed,
      chance: roll.chance,
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
      <h1 className="mb-4 text-xl font-black">🧪 Mock — ForgeDialog (estilo BDO)</h1>
      <div className="mb-6 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Nível de Forja
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
            setGold(8000);
            setBonusXp(0);
          }}
          className="rounded border border-white/20 bg-white/5 px-3 py-1"
        >
          Resetar inventário
        </button>
      </div>
      <p className="max-w-xl text-xs text-white/40">
        Teste: escolher receita no livro (abas Armadura/Arma/Refino), 🔒 por nível (incomum nv5,
        Concentrada nv10), refino "sem falha", lote com placar misto, prévia de stats da peça.
      </p>

      <ForgeDialog
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
