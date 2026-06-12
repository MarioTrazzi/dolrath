'use client';

// 🧪 Página de teste do sistema de aprimoramento (sem banco de dados)
// Simula as regras localmente usando a mesma lógica compartilhada do servidor.

import { useRef, useState } from 'react';
import EnhancementDialog, { EnhanceInfo, EnhanceResult } from '@/components/EnhancementDialog';
import {
  GearCategory,
  getGearCategory,
  getNextLevel,
  getEnhanceChance,
  getLevelLabel,
  getDisplayName,
  getRequiredMaterial,
  getRiskDescription,
  getBaseChance,
  getDurabilityLossOnFail,
  rollEnhancement,
  REPAIR_PER_DUPLICATE,
} from '@/lib/enhancementSystem';

interface MockItem {
  id: string;
  name: string;
  type: string;
  enhancementLevel: number;
  durability: number;
  maxDurability: number;
  copies: number; // cópias extras (material p/ acessórios e reparo)
  stones: number; // pedras disponíveis
  destroyed: boolean;
}

const INITIAL_ITEMS: MockItem[] = [
  { id: 'sword', name: 'Espada Longa de Ferro', type: 'SWORD', enhancementLevel: 0, durability: 100, maxDurability: 100, copies: 3, stones: 999, destroyed: false },
  { id: 'sword14', name: 'Lâmina do Crepúsculo', type: 'SWORD', enhancementLevel: 14, durability: 60, maxDurability: 100, copies: 2, stones: 999, destroyed: false },
  { id: 'armor15', name: 'Couraça do Dragão', type: 'HEAVY_ARMOR', enhancementLevel: 15, durability: 80, maxDurability: 100, copies: 1, stones: 999, destroyed: false },
  { id: 'armor18', name: 'Elmo Real', type: 'HEAVY_HELMET', enhancementLevel: 18, durability: 40, maxDurability: 100, copies: 0, stones: 999, destroyed: false },
  { id: 'ring', name: 'Anel de Rubi', type: 'RING', enhancementLevel: 0, durability: 100, maxDurability: 100, copies: 5, stones: 0, destroyed: false },
  { id: 'neck17', name: 'Colar das Marés', type: 'NECKLACE', enhancementLevel: 17, durability: 100, maxDurability: 100, copies: 2, stones: 0, destroyed: false },
];

export default function TestEnhancementPage() {
  const [items, setItems] = useState<MockItem[]>(INITIAL_ITEMS);
  const [failstacks, setFailstacks] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);

  // refs para os overrides lerem o estado mais recente
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const fsRef = useRef(failstacks);
  fsRef.current = failstacks;

  const appendLog = (line: string) =>
    setLog((prev) => [line, ...prev].slice(0, 30));

  const makeFetchInfo = (id: string) => async (): Promise<EnhanceInfo> => {
    const item = itemsRef.current.find((i) => i.id === id)!;
    const category = getGearCategory(item.type) as GearCategory;
    const targetLevel = getNextLevel(category, item.enhancementLevel);
    if (targetLevel === null || item.destroyed) {
      return {
        maxLevel: true,
        currentLevel: item.enhancementLevel,
        displayName: getDisplayName(item.name, item.enhancementLevel),
      };
    }
    const material = getRequiredMaterial(category, targetLevel);
    const materialAvailable =
      material.kind === 'STONE' ? item.stones > 0 : item.copies > 0;
    const isSafe = getBaseChance(category, targetLevel) >= 1;
    const enoughDurability =
      category === 'ACCESSORY' || isSafe || item.durability >= getDurabilityLossOnFail(targetLevel);
    return {
      maxLevel: false,
      category,
      currentLevel: item.enhancementLevel,
      targetLevel,
      targetLabel: getLevelLabel(targetLevel),
      displayName: getDisplayName(item.name, item.enhancementLevel),
      chance: getEnhanceChance(category, targetLevel, fsRef.current),
      failstacks: fsRef.current,
      durability: item.durability,
      maxDurability: item.maxDurability,
      material:
        material.kind === 'STONE'
          ? { kind: 'STONE', name: material.name }
          : { kind: 'DUPLICATE', name: item.name },
      materialAvailable,
      enoughDurability,
      canEnhance: materialAvailable && enoughDurability,
      risk: getRiskDescription(category, targetLevel, item.enhancementLevel),
    };
  };

  const makeAttempt = (id: string) => async (): Promise<EnhanceResult> => {
    const item = itemsRef.current.find((i) => i.id === id)!;
    const category = getGearCategory(item.type) as GearCategory;
    const outcome = rollEnhancement(category, item.enhancementLevel, fsRef.current)!;

    let newDurability = item.durability;
    if (outcome.success) {
      setFailstacks(0);
    } else {
      setFailstacks((fs) => fs + outcome.failstackGain);
      newDurability = Math.max(0, item.durability - outcome.durabilityLoss);
    }

    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        const materialCost =
          getRequiredMaterial(category, outcome.targetLevel).kind === 'DUPLICATE'
            ? { copies: i.copies - 1 }
            : { stones: i.stones - 1 };
        return {
          ...i,
          ...materialCost,
          enhancementLevel: outcome.destroyed ? i.enhancementLevel : outcome.resultLevel,
          durability: newDurability,
          destroyed: outcome.destroyed,
        };
      })
    );

    const name = getDisplayName(item.name, outcome.resultLevel);
    const message = outcome.success
      ? `✨ Sucesso! ${name}`
      : outcome.destroyed
        ? `💔 ${item.name} foi destruído na tentativa de ${getLevelLabel(outcome.targetLevel)}...`
        : outcome.downgraded
          ? `❌ Falhou! O item regrediu para ${name}.`
          : `❌ Falhou! ${item.name} perdeu ${outcome.durabilityLoss} de durabilidade.`;

    appendLog(
      `${message} (chance ${(outcome.chance * 100).toFixed(1)}%, rolou ${(outcome.roll * 100).toFixed(1)})`
    );

    return {
      success: outcome.success,
      destroyed: outcome.destroyed,
      downgraded: outcome.downgraded,
      chance: outcome.chance,
      newLevel: outcome.resultLevel,
      newLevelLabel: getLevelLabel(outcome.resultLevel),
      durability: newDurability,
      failstacks: outcome.success ? 0 : fsRef.current + outcome.failstackGain,
      message,
    };
  };

  const makeRepair = (id: string) => async () => {
    const item = itemsRef.current.find((i) => i.id === id)!;
    if (item.copies <= 0) {
      return { success: false, durability: item.durability, message: 'Sem cópias para reparar' };
    }
    const durability = Math.min(item.maxDurability, item.durability + REPAIR_PER_DUPLICATE);
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, durability, copies: i.copies - 1 } : i))
    );
    appendLog(`🔧 ${item.name} reparado para ${durability}`);
    return { success: true, durability, message: 'Reparado!' };
  };

  const openItem = items.find((i) => i.id === openId);

  return (
    <div className="min-h-screen bg-gray-950 p-8 text-white">
      <h1 className="mb-2 text-3xl font-bold text-amber-400">🧪 Teste — Sistema de Aprimoramento</h1>
      <p className="mb-6 text-gray-400">
        Simulação local com as mesmas regras do servidor (sem banco de dados). Failstacks atuais:{' '}
        <span className="font-bold text-purple-400">🔥 {failstacks}</span>
      </p>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={`flex items-center justify-between rounded-lg border p-4 ${
              item.destroyed
                ? 'border-red-900 bg-red-950/30 opacity-50'
                : 'border-white/10 bg-gray-900'
            }`}
          >
            <div>
              <div
                className={`font-semibold ${
                  item.enhancementLevel >= 16
                    ? 'text-orange-400'
                    : item.enhancementLevel > 0
                      ? 'text-cyan-300'
                      : ''
                }`}
              >
                {item.destroyed ? `💔 ${item.name} (destruído)` : getDisplayName(item.name, item.enhancementLevel)}
              </div>
              <div className="text-xs text-gray-400">
                {item.type} · durabilidade {item.durability}/{item.maxDurability} · cópias {item.copies}
              </div>
            </div>
            <button
              onClick={() => setOpenId(item.id)}
              disabled={item.destroyed}
              className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-black hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-gray-800 disabled:text-gray-500"
            >
              ⚒️ Aprimorar
            </button>
          </div>
        ))}
      </div>

      <div className="mt-6 rounded-lg border border-white/10 bg-gray-900 p-4">
        <h2 className="mb-2 font-semibold text-gray-300">📜 Log de tentativas</h2>
        {log.length === 0 ? (
          <p className="text-sm text-gray-500">Nenhuma tentativa ainda.</p>
        ) : (
          <ul className="space-y-1 text-sm text-gray-400">
            {log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        )}
      </div>

      {openItem && (
        <EnhancementDialog
          open={!!openId}
          onClose={() => setOpenId(null)}
          characterId="mock"
          inventoryId={openItem.id}
          itemName={openItem.name}
          fetchInfoOverride={makeFetchInfo(openItem.id)}
          attemptOverride={makeAttempt(openItem.id)}
          repairOverride={makeRepair(openItem.id)}
        />
      )}
    </div>
  );
}
