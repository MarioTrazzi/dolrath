// 🌾 Sistema de FAZENDA — cultivo idle do Dolrath
//
// A fazenda é o par da Coleta: as SEMENTES só caem coletando nos Campos de
// Ervas (gathering.ts), e o cultivo devolve os insumos renováveis que as
// receitas pedem. Três estruturas, todas lazy por timestamp (sem cron):
//
//  - CANTEIROS (kind='crop'): planta semente → cresce em tempo real → colhe.
//    Nº de canteiros e velocidade crescem com o nível de Fazenda
//    (professionSystem.farmPlotCount / farmGrowthMult).
//  - POÇO (kind='well'): sem semente; goteja Água Pura (o solvente de quase
//    toda poção) até um teto — coletar zera a âncora.
//  - CERCADO (kind='pen', nível 5): consome 1 Ração e devolve Couro após um
//    ciclo. É a fonte renovável de couro (a masmorra/bosque seguem dropando).
//
// Plantar/colher custa stamina de AÇÃO; o crescimento em si é grátis — é a
// fazenda trabalhando, não o personagem. XP de Fazenda vem da colheita.

import { farmGrowthMult } from './professionSystem';

export type CropId = 'trigo' | 'erva' | 'linho';

export interface CropDef {
  id: CropId;
  /** Semente consumida no plantio (SEED_CATALOG). */
  seedName: string;
  /** Item colhido (INGREDIENT_CATALOG / FORGE_MATERIAL_CATALOG). */
  outputName: string;
  emoji: string;
  /** Tempo base de crescimento (reduzido pelo nível de Fazenda). */
  growSeconds: number;
  yieldMin: number;
  yieldMax: number;
  /** XP de Fazenda por colheita. */
  farmXp: number;
}

export const CROPS: Record<CropId, CropDef> = {
  trigo: {
    id: 'trigo',
    seedName: 'Semente de Trigo',
    outputName: 'Trigo',
    emoji: '🌾',
    growSeconds: 2 * 3600,
    yieldMin: 3,
    yieldMax: 5,
    farmXp: 8,
  },
  erva: {
    id: 'erva',
    seedName: 'Semente de Erva Medicinal',
    outputName: 'Erva Medicinal',
    emoji: '🌿',
    growSeconds: 3 * 3600,
    yieldMin: 2,
    yieldMax: 4,
    farmXp: 10,
  },
  linho: {
    id: 'linho',
    seedName: 'Semente de Linho',
    outputName: 'Fibra de Linho',
    emoji: '🧵',
    growSeconds: 4 * 3600,
    yieldMin: 3,
    yieldMax: 5,
    farmXp: 12,
  },
};

export function getCropById(id: string): CropDef | undefined {
  return (CROPS as Record<string, CropDef>)[id];
}

export function getCropBySeedName(seedName: string): CropDef | undefined {
  return Object.values(CROPS).find((c) => c.seedName === seedName);
}

// ============================================================
// Estruturas fixas (poço e cercado) — slots reservados no grid
// ============================================================

// Canteiros ocupam slotIndex 0..5; estruturas usam índices altos reservados.
export const WELL_SLOT_INDEX = 100;
export const PEN_SLOT_INDEX = 101;

export const WELL = {
  outputName: 'Água Pura',
  emoji: '💧',
  /** 1 Água Pura a cada 30 min. */
  intervalSeconds: 30 * 60,
  /** Acúmulo máximo sem coletar (força a visita, não o farm infinito). */
  cap: 12,
  farmXpPerCollect: 2,
};

export const PEN = {
  feedName: 'Ração',
  outputName: 'Couro',
  emoji: '🐄',
  /** Ciclo de produção após alimentar. */
  cycleSeconds: 4 * 3600,
  yield: 2,
  farmXp: 12,
};

/** Stamina cobrada por AÇÃO na fazenda (coletar poço, alimentar/colher cercado). */
export const FARM_ACTION_STAMINA = 2;

/** Stamina de plantar um canteiro (canteiro v2, mockup Fazenda.html). */
export const FARM_PLANT_STAMINA = 2;

/** Stamina de colher um canteiro pronto (mais barato que plantar). */
export const FARM_HARVEST_STAMINA = 1;

/**
 * Chance (%) de a colheita de um canteiro render um Estilhaço de Pedra Negra
 * junto do cultivo — bônus raro do canteiro v2. Cresce com o nível de Fazenda,
 * teto 60% (mesmo formato de curva do mockup Fazenda.html).
 */
export function farmStoneChance(farmLevel: number): number {
  return Math.min(60, 4 + 2 * (Math.max(1, farmLevel) - 1));
}

/** XP de Fazenda extra quando a colheita rende um estilhaço. */
export const FARM_STONE_BONUS_XP = 10;

/** Estilhaços de Pedra Negra que podem cair na colheita (sorteio 50/50). */
export const FARM_STONE_SHARDS = [
  'Estilhaço de Pedra Negra (Arma)',
  'Estilhaço de Pedra Negra (Armadura)',
] as const;

export function rollFarmStoneShard(rng: () => number = Math.random): string {
  return FARM_STONE_SHARDS[rng() < 0.5 ? 0 : 1];
}

// ============================================================
// Estado derivado (funções puras — o servidor decide, o cliente exibe)
// ============================================================

/** Tempo real de crescimento de um cultivo para um nível de Fazenda. */
export function cropGrowSeconds(crop: CropDef, farmLevel: number): number {
  return Math.round(crop.growSeconds * farmGrowthMult(farmLevel));
}

/** true quando um canteiro plantado em `plantedAt` já pode ser colhido. */
export function isCropReady(plantedAt: Date, crop: CropDef, farmLevel: number, now: Date = new Date()): boolean {
  return now.getTime() - plantedAt.getTime() >= cropGrowSeconds(crop, farmLevel) * 1000;
}

/** Segundos restantes até a colheita (0 quando pronto). */
export function cropSecondsLeft(plantedAt: Date, crop: CropDef, farmLevel: number, now: Date = new Date()): number {
  const total = cropGrowSeconds(crop, farmLevel);
  const elapsed = (now.getTime() - plantedAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(total - elapsed));
}

/** Quantidade colhida (aleatória no intervalo do cultivo). */
export function rollCropYield(crop: CropDef, rng: () => number = Math.random): number {
  return crop.yieldMin + Math.floor(rng() * (crop.yieldMax - crop.yieldMin + 1));
}

/** Águas acumuladas no poço desde a última coleta (`anchor`), limitado ao teto. */
export function wellPending(anchor: Date | null, now: Date = new Date()): number {
  if (!anchor) return 0;
  const elapsed = Math.max(0, (now.getTime() - anchor.getTime()) / 1000);
  return Math.min(WELL.cap, Math.floor(elapsed / WELL.intervalSeconds));
}

/** true quando o ciclo do cercado (alimentado em `fedAt`) terminou. */
export function isPenReady(fedAt: Date, now: Date = new Date()): boolean {
  return now.getTime() - fedAt.getTime() >= PEN.cycleSeconds * 1000;
}

/** Segundos restantes do ciclo do cercado (0 quando pronto). */
export function penSecondsLeft(fedAt: Date, now: Date = new Date()): number {
  const elapsed = (now.getTime() - fedAt.getTime()) / 1000;
  return Math.max(0, Math.ceil(PEN.cycleSeconds - elapsed));
}
