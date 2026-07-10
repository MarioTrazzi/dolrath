'use client';

// 🧪 Mock da ProcessingDialog — verificação visual SEM banco (padrão dev/*).
// Knobs: nível de Processamento (gating) e gold. Sem knob de resultado: o
// processamento nunca falha (modelo do refino). O inventário fake de matéria-
// prima desconta a cada beneficiamento.

import { useMemo, useRef, useState } from 'react';
import ProcessingDialog, {
  type ProcessingCraftResult,
  type ProcessingInventoryItem,
} from '@/components/crafting/ProcessingDialog';
import { getProcessingRecipeById } from '@/lib/processing';
import { getIngredientByName } from '@/lib/itemCatalog';
import { getProfessionLevelInfo, professionXpForLevel } from '@/lib/professionSystem';

const START_INV: [string, number][] = [
  // Fundição
  ['Ferro', 12],
  ['Ferro Pesado', 8],
  ['Metal Leve', 6],
  ['Cristal Bruto', 6],
  ['Fragmentos de Joias', 6],
  // Madeira
  ['Madeira Flexível', 8],
  ['Seiva de Ent', 6],
  // Têxtil / curtume
  ['Couro', 10],
  ['Fibra de Linho', 10],
  ['Tecido de Linho', 2],
  // Moagem / destilaria
  ['Trigo', 12],
  ['Erva Medicinal', 12],
  ['Flor de Mana', 8],
  ['Raiz Vigorosa', 8],
  ['Água Pura', 20],
];

export default function ProcessingDialogMockPage() {
  const [open, setOpen] = useState(true);
  const [level, setLevel] = useState(1);
  const [gold, setGold] = useState(3000);
  const [bonusXp, setBonusXp] = useState(0);
  const invRef = useRef(new Map<string, number>(START_INV));
  const dialogKey = useMemo(() => `${level}`, [level]);

  const xp = professionXpForLevel(level) + bonusXp;

  const fetchInventoryOverride = async (): Promise<ProcessingInventoryItem[]> =>
    Array.from(invRef.current.entries())
      .filter(([, q]) => q > 0)
      .map(([name, quantity], i) => ({
        id: `mock-${i}`,
        quantity,
        item: {
          name,
          type: 'CONSUMABLE',
          stats: { kind: getIngredientByName(name) ? 'ingredient' : 'material' },
        },
      }));

  const attemptOverride = async (
    recipeId: string,
    quantity: number,
  ): Promise<ProcessingCraftResult> => {
    await new Promise((r) => setTimeout(r, 600)); // latência fake do servidor
    const recipe = getProcessingRecipeById(recipeId)!;
    const xpGained = recipe.xp * quantity;
    // Consome inventário/gold fake e credita a saída (determinístico, sem falha).
    for (const input of recipe.inputs) {
      invRef.current.set(input.name, (invRef.current.get(input.name) ?? 0) - input.quantity * quantity);
    }
    invRef.current.set(recipe.outputName, (invRef.current.get(recipe.outputName) ?? 0) + quantity);
    setGold((g) => g - recipe.goldCost * quantity);
    setBonusXp((b) => b + xpGained);
    return {
      attempted: quantity,
      succeeded: quantity,
      failed: 0,
      chance: 1,
      xpGained,
      levelInfo: getProfessionLevelInfo(xp + xpGained),
      characterGold: gold - recipe.goldCost * quantity,
      outputName: recipe.outputName,
      rarity: recipe.rarity,
      message: `⚙️ ${quantity > 1 ? `${quantity}× ` : ''}${recipe.outputName} processado${quantity > 1 ? 's' : ''} com sucesso!`,
    };
  };

  return (
    <div className="min-h-dvh bg-[#0c0c0e] p-6 text-white">
      <h1 className="mb-4 text-xl font-black">🧪 Mock — ProcessingDialog (estilo BDO)</h1>
      <div className="mb-6 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Nível de Processamento
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
            setGold(3000);
            setBonusXp(0);
          }}
          className="rounded border border-white/20 bg-white/5 px-3 py-1"
        >
          Resetar inventário
        </button>
      </div>
      <p className="max-w-xl text-xs text-white/40">
        Teste: livro por bancada (Fundição/Madeira/Têxtil/Moagem/Destilaria), 🔒 por nível da
        RECEITA (Bandagem nv3, Barra de Aço/Lâmina nv5, Verniz/Extrato nv8, Cristal nv10, Joia
        nv15), "sem falha" sempre, lote (máx 99), XP fixo por receita, saída empilhada no
        inventário fake (Tecido de Linho processado vira insumo da Bandagem).
      </p>

      <ProcessingDialog
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
