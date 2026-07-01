# 22 — Tokenomics

Números vivos da economia dual-token. A especificação está no [Whitepaper](../21-whitepaper/WHITEPAPER-ECONOMICO.md); aqui ficam o **simulador**, a **planilha** e o **dashboard** (Fases 3 e 4 do plano de documentação).

## DOL — resumo

- **Supply fixo:** 1.000.000.000 DOL (ERC-20, Polygon).
- **Alocação:** Play & Achieve 30% · Treasury/DAO 20% · Equipe 15% (cliff 12m + 36m) · Investidores 12% (cliff 6m + 24m) · Liquidez 10% (25% no TGE) · Ecossistema 8% · Comunidade 5%.
- **Emissão a jogadores:** 25% do saldo restante do bucket por ano (ano 1: 75M; ano 2: 56M; ano 3: 42M…).
- **Queimas:** 2,5% do mercado de personagens, 50% dos passes em DOL, coleções primárias, buyback trimestral (DAO).

## GOLD — resumo

- Emissão elástica gateada por gameplay: teto diário **20.000/usuário** (`DUNGEON_DAILY_GOLD_CAP`), stamina, servidor-autoritativo.
- Claim on-chain assinado (EIP-712); sinks off-chain atacam o saldo **antes** do claim.
- Taxa de marketplace 4% (2% burn / 2% treasury) — [LAUNCH].

## Simulador (Fase 3)

```bash
node scripts/token-economy-sim.js
```

Determinístico, 120 meses, 3 cenários (bear/base/bull). Modela: entrada/saída de jogadores (curva logística + churn), emissão diária de GOLD, claim rate, burn, crescimento, staking, liquidez, market cap (preço de DOL é **premissa exógena por cenário**, não previsão), treasury.

Saídas geradas neste diretório:

| Arquivo | O quê |
|---|---|
| [`simulacao-10-anos.csv`](simulacao-10-anos.csv) | planilha mensal completa (long format: cenário × mês × 22 colunas) — abre no Excel/Sheets |
| [`dashboard-data.js`](dashboard-data.js) | dados para o dashboard |

Colunas do CSV: `mau, joins, quits, dau, goldFaucet, goldClaimed, goldOnchainSupply, goldBurnMonth, goldBurnedTotal, goldTreasury, dolEmissionMonth, dolUnlocked, dolCirculating, dolLocked, dolStaked, dolFloatFree, dolBurnMonth, dolBurnedTotal, dolTreasury, inflationMonthlyPct, marketCapUsd, liquidityUsd`.

### Resultados de referência (cenário base)

| Ano | MAU | DOL circulante | Burn acumulado | GOLD on-chain |
|---|---|---|---|---|
| 1 | ~1,8k | 267M | ~2k | 47M |
| 3 | ~8,4k | 746M | 775k | 716M |
| 5 | ~21k | 925M | 3,5M | 3,2B |
| 10 | ~35k | 966M | 17,5M | 17,8B |

Leitura honesta: com apenas as queimas de marketplace, o DOL quase estabiliza no cenário base e só fica deflacionário no otimista (ano 5+). **As queimas do roadmap (passes, coleções, buyback) são necessárias, não decorativas.** GOLD on-chain cresce em valor absoluto (moeda elástica), o que importa é o sink/faucet e o GOLD *por jogador* — ambos monitorados ([Analytics](../32-analytics/README.md)).

## Dashboard (Fase 4)

Abra **[`dashboard.html`](dashboard.html)** no navegador (duplo clique — funciona offline). Gráficos: circulação de DOL, DOL bloqueado vs staked, emissão × burn mensal, crescimento de jogadores, treasury, GOLD on-chain, market cap por cenário.

Para atualizar os dados: rode o simulador de novo (o HTML lê `dashboard-data.js`).

## Mudar premissas

Edite os objetos `SCENARIOS`/`DOL` no topo de `scripts/token-economy-sim.js` e rode de novo. Toda mudança de premissa deve ser commitada junto com o CSV regenerado — o histórico do git é o registro das revisões do modelo.
