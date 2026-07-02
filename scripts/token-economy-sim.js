#!/usr/bin/env node
/**
 * Dolrath — Simulador Econômico (Fase 3 da documentação)
 *
 * Projeta 120 meses (10 anos) da economia dual-token (DOL/GOLD) em três
 * cenários (bear/base/bull). Determinístico: mesmos parâmetros → mesma saída.
 *
 * Saídas (em docs/22-tokenomics/):
 *   - simulacao-10-anos.csv      planilha mensal (todas as séries, 3 cenários)
 *   - dashboard-data.js          dados p/ o dashboard.html (window.DOLRATH_SIM)
 *
 * Premissas ancoradas no jogo real:
 *   - GOLD: teto diário DUNGEON_DAILY_GOLD_CAP (20k/usuário) clampa o faucet;
 *     faucet médio efetivo medido ~4.9k-10.9k/dia/personagem (memória do
 *     review econômico 2026-06-23), reduzido por sinks off-chain antes do claim.
 *   - DOL: supply fixo 1B, buckets/vesting do whitepaper (§7/§9), emissão do
 *     bucket Play & Achieve = 25% do saldo restante por ano.
 *
 * Uso: node scripts/token-economy-sim.js
 */

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Parâmetros do token DOL (fonte: whitepaper §7 e §9)
// ---------------------------------------------------------------------------
const DOL = {
  supply: 1_000_000_000,
  buckets: {
    playAchieve: 0.30, // epochs c/ decaimento 25% do saldo restante/ano
    treasury: 0.20,    // linear 48m
    team: 0.15,        // cliff 12m + linear 36m
    investors: 0.12,   // cliff 6m + linear 24m
    liquidity: 0.10,   // 25% no TGE, resto linear 24m
    ecosystem: 0.08,   // linear 36m, lock 12m
    community: 0.05,   // 40% no TGE (campanhas), resto linear 12m
  },
  liquidityTgeShare: 0.25,
  communityTgeShare: 0.40,
  playAchieveYearlyRate: 0.25,
  stakingShareOfEpoch: 0.20, // sub-alocação de staking dentro de cada epoch
};

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------
const SCENARIOS = {
  bear: {
    label: 'Pessimista',
    mauCap: 20_000,          // teto de jogadores ativos mensais
    mauGrowth: 0.10,         // crescimento logístico mensal
    monthlyChurn: 0.12,      // % dos MAU que sai no mês
    newPlayerBoost: 1.0,     // marketing
    dauRatio: 0.25,          // DAU/MAU
    goldPerDauDay: 3_000,    // GOLD líquido creditado por DAU/dia (pós-sinks off-chain)
    claimRate: 0.20,         // % do GOLD off-chain sacado on-chain
    onchainSinkRate: 0.30,   // % do GOLD on-chain gasto em compras/treasury por mês
    mktVolumePerMau: 150,    // GOLD de volume de marketplace por MAU/mês
    charTradesPerKMau: 3,    // vendas de personagem por 1.000 MAU/mês
    avgCharPriceDol: 400,    // preço médio em DOL
    dolPrice: 0.005,         // premissa exógena (USD)
    stakeRate: 0.20,         // % do circulante em stake
  },
  base: {
    label: 'Base',
    mauCap: 80_000,
    mauGrowth: 0.14,
    monthlyChurn: 0.08,
    newPlayerBoost: 1.0,
    dauRatio: 0.30,
    goldPerDauDay: 3_500,
    claimRate: 0.30,
    onchainSinkRate: 0.40,
    mktVolumePerMau: 400,
    charTradesPerKMau: 8,
    avgCharPriceDol: 600,
    dolPrice: 0.02,
    stakeRate: 0.35,
  },
  bull: {
    label: 'Otimista',
    mauCap: 300_000,
    mauGrowth: 0.18,
    monthlyChurn: 0.06,
    newPlayerBoost: 1.2,
    dauRatio: 0.35,
    goldPerDauDay: 4_000,
    claimRate: 0.40,
    onchainSinkRate: 0.45,
    mktVolumePerMau: 800,
    charTradesPerKMau: 15,
    avgCharPriceDol: 900,
    dolPrice: 0.08,
    stakeRate: 0.40,
  },
};

const MONTHS = 120;
const DAYS = 30.44;
const START_MAU = 500; // beta atual

// Taxas [LAUNCH] (whitepaper §8/§11): marketplace itens 4% (2 burn/2 treasury),
// personagens 5% em DOL (2.5/2.5)
const ITEM_FEE_BURN = 0.02;
const ITEM_FEE_TREASURY = 0.02;
const CHAR_FEE_BURN = 0.025;
const CHAR_FEE_TREASURY = 0.025;

// ---------------------------------------------------------------------------
// Vesting helpers (retornam fração do bucket liberada até o mês m, 1-indexado)
// ---------------------------------------------------------------------------
function linear(m, months, cliff = 0, tgeShare = 0) {
  if (m <= 0) return tgeShare;
  if (m < cliff) return tgeShare;
  const vested = Math.min(1, (m - cliff) / months);
  return Math.min(1, tgeShare + (1 - tgeShare) * vested);
}

function playAchieveReleased(m) {
  // 25% do saldo restante por ano, distribuído uniformemente nos meses do ano
  let released = 0;
  let remaining = 1;
  let fullYears = Math.floor(m / 12);
  for (let y = 0; y < fullYears; y++) {
    const yearly = remaining * DOL.playAchieveYearlyRate;
    released += yearly;
    remaining -= yearly;
  }
  const frac = (m % 12) / 12;
  released += remaining * DOL.playAchieveYearlyRate * frac;
  return released;
}

// ---------------------------------------------------------------------------
// Simulação
// ---------------------------------------------------------------------------
function simulate(key) {
  const s = SCENARIOS[key];
  const rows = [];

  let mau = START_MAU;
  let goldOffchain = 0;      // saldo agregado claimável (bancos)
  let goldOnchainSupply = 0; // GOLD ERC-20 circulante
  let goldBurnedTotal = 0;
  let goldTreasury = 0;      // GOLD acumulado no treasury
  let dolBurnedTotal = 0;
  let dolTreasuryDol = 0;    // DOL de taxas acumulado no treasury (fora do bucket)

  for (let m = 1; m <= MONTHS; m++) {
    // --- jogadores (logístico + churn) ---
    const joins = Math.round(
      s.mauGrowth * mau * (1 - mau / s.mauCap) * s.newPlayerBoost + 50
    );
    const quits = Math.round(mau * s.monthlyChurn);
    mau = Math.max(START_MAU, mau + joins - quits);
    const dau = Math.round(mau * s.dauRatio);

    // --- GOLD ---
    const goldFaucet = dau * s.goldPerDauDay * DAYS; // líquido pós-sinks off-chain
    goldOffchain += goldFaucet;
    const goldClaimed = goldOffchain * (s.claimRate / 12); // claim gradual do estoque
    goldOffchain -= goldClaimed;
    goldOnchainSupply += goldClaimed;

    const mktVolume = mau * s.mktVolumePerMau;
    const goldBurn = mktVolume * ITEM_FEE_BURN;
    const goldFeeTreasury = mktVolume * ITEM_FEE_TREASURY;
    const onchainSpend = goldOnchainSupply * s.onchainSinkRate / 12;
    goldOnchainSupply = Math.max(0, goldOnchainSupply - goldBurn - onchainSpend);
    goldBurnedTotal += goldBurn;
    goldTreasury += goldFeeTreasury + onchainSpend;

    // --- DOL: unlocks ---
    const b = DOL.buckets;
    const unlocked =
      DOL.supply *
      (b.playAchieve * playAchieveReleased(m) +
        b.treasury * linear(m, 48) +
        b.team * linear(m, 36, 12) +
        b.investors * linear(m, 24, 6) +
        b.liquidity * linear(m, 24, 0, DOL.liquidityTgeShare) +
        b.ecosystem * linear(m, 36, 12) +
        b.community * linear(m, 12, 0, DOL.communityTgeShare));

    const emissionMonth =
      DOL.supply * b.playAchieve * (playAchieveReleased(m) - playAchieveReleased(m - 1));

    // --- DOL: burn (mercado de personagens + passes a partir do mês 18) ---
    const charTrades = (mau / 1000) * s.charTradesPerKMau;
    const charVolumeDol = charTrades * s.avgCharPriceDol;
    let dolBurn = charVolumeDol * CHAR_FEE_BURN;
    let dolFeeTreasury = charVolumeDol * CHAR_FEE_TREASURY;
    if (m >= 18) {
      // passe de temporada premium: 5% dos MAU compram/mês, 300 DOL, 50% burn
      const passVolume = mau * 0.05 * 300;
      dolBurn += passVolume * 0.5;
      dolFeeTreasury += passVolume * 0.1;
    }
    dolBurnedTotal += dolBurn;
    dolTreasuryDol += dolFeeTreasury;

    const circulating = Math.max(0, unlocked - dolBurnedTotal);
    const locked = DOL.supply - unlocked;
    const staked = circulating * s.stakeRate;
    const floatFree = circulating - staked;
    const treasuryDolTotal =
      DOL.supply * b.treasury * linear(m, 48) + dolTreasuryDol - dolBurnedTotal * 0; // bucket + taxas
    const marketCap = circulating * s.dolPrice;
    const inflationMonthly =
      m === 1 ? 0 : emissionMonth / Math.max(1, circulating - emissionMonth);

    rows.push({
      month: m,
      mau,
      joins,
      quits,
      dau,
      goldFaucet: Math.round(goldFaucet),
      goldClaimed: Math.round(goldClaimed),
      goldOnchainSupply: Math.round(goldOnchainSupply),
      goldBurnMonth: Math.round(goldBurn),
      goldBurnedTotal: Math.round(goldBurnedTotal),
      goldTreasury: Math.round(goldTreasury),
      dolEmissionMonth: Math.round(emissionMonth),
      dolUnlocked: Math.round(unlocked),
      dolCirculating: Math.round(circulating),
      dolLocked: Math.round(locked),
      dolStaked: Math.round(staked),
      dolFloatFree: Math.round(floatFree),
      dolBurnMonth: Math.round(dolBurn),
      dolBurnedTotal: Math.round(dolBurnedTotal),
      dolTreasury: Math.round(treasuryDolTotal),
      inflationMonthlyPct: +(inflationMonthly * 100).toFixed(3),
      marketCapUsd: Math.round(marketCap),
      liquidityUsd: Math.round(marketCap * 0.08), // alvo: ~8% do mcap em TVL de pool
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Saídas
// ---------------------------------------------------------------------------
const outDir = path.join(__dirname, '..', 'docs', '22-tokenomics');
fs.mkdirSync(outDir, { recursive: true });

const results = {};
for (const key of Object.keys(SCENARIOS)) results[key] = simulate(key);

// CSV (long format: uma linha por cenário×mês)
const cols = Object.keys(results.base[0]);
const header = ['scenario', ...cols].join(',');
const lines = [header];
for (const key of Object.keys(results)) {
  for (const row of results[key]) {
    lines.push([key, ...cols.map((c) => row[c])].join(','));
  }
}
fs.writeFileSync(path.join(outDir, 'simulacao-10-anos.csv'), lines.join('\n') + '\n');

// Dados do dashboard (funciona via file:// — não usa fetch)
const dashboard = {
  generatedAt: new Date().toISOString(),
  months: MONTHS,
  supply: DOL.supply,
  buckets: DOL.buckets,
  scenarios: Object.fromEntries(
    Object.entries(results).map(([k, rows]) => [
      k,
      {
        label: SCENARIOS[k].label,
        dolPrice: SCENARIOS[k].dolPrice,
        series: Object.fromEntries(cols.map((c) => [c, rows.map((r) => r[c])])),
      },
    ])
  ),
};
const dashboardJs =
  '// Gerado por scripts/token-economy-sim.js — NÃO editar à mão\n' +
  'window.DOLRATH_SIM = ' +
  JSON.stringify(dashboard) +
  ';\n';
fs.writeFileSync(path.join(outDir, 'dashboard-data.js'), dashboardJs);

// Cópia pública: dashboard servido em produção em /tokenomics/dashboard.html
const publicDir = path.join(__dirname, '..', 'public', 'tokenomics');
if (fs.existsSync(publicDir)) {
  fs.writeFileSync(path.join(publicDir, 'dashboard-data.js'), dashboardJs);
  fs.copyFileSync(path.join(outDir, 'dashboard.html'), path.join(publicDir, 'dashboard.html'));
  fs.copyFileSync(path.join(outDir, 'simulacao-10-anos.csv'), path.join(publicDir, 'simulacao-10-anos.csv'));
}

// Resumo no terminal
function fmt(n) {
  return n.toLocaleString('pt-BR');
}
console.log('Dolrath — simulação econômica (120 meses)\n');
for (const key of Object.keys(results)) {
  const r = results[key];
  const y = (n) => r[n * 12 - 1];
  console.log(`Cenário ${SCENARIOS[key].label} (${key}) — preço DOL premissa $${SCENARIOS[key].dolPrice}`);
  for (const yr of [1, 3, 5, 10]) {
    const row = y(yr);
    console.log(
      `  Ano ${String(yr).padStart(2)}: MAU ${fmt(row.mau).padStart(8)} | ` +
        `DOL circ. ${fmt(row.dolCirculating).padStart(12)} | ` +
        `burn acum. ${fmt(row.dolBurnedTotal).padStart(11)} | ` +
        `mcap $${fmt(row.marketCapUsd).padStart(11)} | ` +
        `GOLD on-chain ${fmt(row.goldOnchainSupply).padStart(14)}`
    );
  }
  console.log('');
}
console.log(`Saídas: ${path.relative(process.cwd(), outDir)}/simulacao-10-anos.csv e dashboard-data.js`);
