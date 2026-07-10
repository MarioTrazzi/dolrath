'use client';

// 🧪 Mock da CookingDialog — verificação visual SEM banco (padrão dev/*).
// Knobs: nível de Culinária (gating) e gold. Sem knob de resultado: cozinhar
// nunca falha (modelo do processamento). O inventário fake de insumos
// desconta a cada prato cozinhado.

import { useMemo, useRef, useState } from 'react';
import CookingDialog, {
  type CookingCraftResult,
  type CookingInventoryItem,
} from '@/components/crafting/CookingDialog';
import { getCookingRecipeById } from '@/lib/cooking';
import { getIngredientByName } from '@/lib/itemCatalog';
import { getProfessionLevelInfo, professionXpForLevel } from '@/lib/professionSystem';

const START_INV: [string, number][] = [
  // Moagem (processados) + fazenda
  ['Farinha', 12],
  ['Ração', 6],
  // Ingredientes de coleta/masmorra
  ['Água Pura', 20],
  ['Erva Medicinal', 12],
  ['Raiz Vigorosa', 10],
  ['Cogumelo Lunar', 10],
  ['Seiva Ancestral', 4],
];

export default function CookingDialogMockPage() {
  const [open, setOpen] = useState(true);
  const [level, setLevel] = useState(1);
  const [gold, setGold] = useState(3000);
  const [bonusXp, setBonusXp] = useState(0);
  const invRef = useRef(new Map<string, number>(START_INV));
  const dialogKey = useMemo(() => `${level}`, [level]);

  const xp = professionXpForLevel(level) + bonusXp;

  const fetchInventoryOverride = async (): Promise<CookingInventoryItem[]> =>
    Array.from(invRef.current.entries())
      .filter(([, q]) => q > 0)
      .map(([name, quantity], i) => ({
        id: `mock-${i}`,
        quantity,
        item: {
          name,
          type: 'CONSUMABLE',
          stats: { kind: getIngredientByName(name) ? 'ingredient' : 'processed' },
        },
      }));

  const attemptOverride = async (
    recipeId: string,
    quantity: number,
  ): Promise<CookingCraftResult> => {
    await new Promise((r) => setTimeout(r, 600)); // latência fake do servidor
    const recipe = getCookingRecipeById(recipeId)!;
    const xpGained = recipe.xp * quantity;
    // Consome inventário/gold fake e credita o prato (determinístico, sem falha).
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
      message: `🍳 ${quantity > 1 ? `${quantity}× ` : ''}${recipe.outputName} cozinhado${quantity > 1 ? 's' : ''} com sucesso!`,
    };
  };

  return (
    <div className="min-h-dvh bg-[#0c0c0e] p-6 text-white">
      <h1 className="mb-4 text-xl font-black">🧪 Mock — CookingDialog (estilo BDO)</h1>
      <div className="mb-6 flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          Nível de Culinária
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
        Teste: livro por estação (Forno/Panela/Frescos), 🔒 por nível da RECEITA (Pão nv1,
        Assado/Salada nv3, Torta/Ensopado nv5, Banquete nv10), &quot;sem falha&quot; sempre, lote
        (máx 99), XP fixo por receita, card do prato mostrando o BUFF por tempo real
        (&quot;+2 STR por 30 min reais&quot;; Pão mostra a cura fora de combate).
      </p>

      <CookingDialog
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
