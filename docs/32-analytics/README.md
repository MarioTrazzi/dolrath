# 32 — Analytics

> **Status: EM BREVE como sistema** — hoje as métricas são extraídas por scripts ad-hoc contra o Neon; o pipeline formal de eventos é roadmap. Este doc define O QUE medir desde já.

## KPIs econômicos (norte do projeto)

| KPI | Definição | Meta |
|---|---|---|
| **Sink/Faucet ratio** | GOLD destruído ÷ GOLD emitido (janela 7d) | ≥ 0,7 |
| Emissão diária de GOLD | soma de créditos de faucet/dia | ≤ cap × usuários ativos × 0,6 |
| Claim rate | % do GOLD off-chain sacado on-chain | 20–40% (saudável) |
| Burn de DOL mensal | taxas + serviços queimados | crescente com volume |
| Treasury runway | meses de operação cobertos | ≥ 18 meses |
| Velocidade do GOLD on-chain | volume transf. ÷ supply | alta = economia viva |

## KPIs de produto

| KPI | Meta inicial |
|---|---|
| D1/D7/D30 retenção | 40% / 20% / 10% |
| Sessões/dia por jogador ativo | ≥ 2 (stamina desenhada p/ isso) |
| % de jogadores que craftam na semana | ≥ 35% |
| % de MAU que toca marketplace | ≥ 15% |
| Win-rate PvP por classe (semanal) | 45–55% (alarme fora disso) |
| Conversão wallet (jogador → carteira ligada) | ≥ 25% |

## Fontes de dados hoje

- Postgres/Neon: `DungeonRun.goldEarned` (emissão), `CharacterHistory`, saldos.
- On-chain: eventos `Claimed` (emissão on-chain), `ListingPurchased` (volume de mercado), `Transfer` p/ treasury.
- Simuladores (`scripts/`) como baseline esperado.

## Roadmap

1. Tabela `EconomyEvent` (evento tipado por transação de valor) + snapshot diário agregado.
2. Dashboard interno (mesma base do [Tokenomics Dashboard](../22-tokenomics/dashboard.html), com dados reais no lugar da simulação).
3. Alertas: sink/faucet < 0,6; emissão > P95 histórico; win-rate fora da banda.
4. Relatório mensal público de emissão/burn (compromisso do whitepaper).
