# 07 — Economy

Esta seção é o coração da Game Bible. O documento principal é o **[Game Economy Design Document (EDD)](GAME-ECONOMY-DESIGN.md)** — todos os faucets e sinks de GOLD com os números reais do código, fórmulas, e as economias de cada sistema (PvE, PvP, craft, marketplace, e os sistemas EM BREVE).

## Resumo executivo da economia

- **Dois tokens:** GOLD (utilidade, ganho jogando, emissão gateada) e DOL (escasso, valor de longo prazo). Detalhes: [GOLD](../10-gold-token/README.md), [DOL](../09-dol-token/README.md), [Whitepaper](../21-whitepaper/WHITEPAPER-ECONOMICO.md).
- **Modelo do banco:** cada personagem carrega GOLD "na mão" (`Character.gold`, ganho em masmorra/PvP/venda) e a conta tem um **banco** (`User.goldBalance`) — só o banco é reivindicável on-chain. Gastar antes de sacar é o desenho: sinks off-chain queimam antes da emissão on-chain.
- **Emissão controlada:** faucet de masmorra é servidor-autoritativo com **teto diário por usuário** (`DUNGEON_DAILY_GOLD_CAP`, default 20.000/dia).
- **Loop econômico saudável medido:** uma run completa da Floresta tem saldo líquido **negativo** em GOLD (~-1.000 a -2.300) quando o jogador consome poções/reparos — a masmorra paga em progresso (XP, materiais, drops), não em ouro livre.

## Mapa de fluxo (visão de 1 tela)

```
                        FAUCETS                                SINKS
  Masmorra (salas/boss/eventos) ──┐            ┌── Loja (equipamento, consumível)
  PvP (vitória/empate/derrota) ───┤            ├── Forja (craft 30%, refino, reparo)
  Venda de item (60% catálogo) ───┤            ├── Alquimia (taxa 30% + ingredientes)
                                  ▼            ├── Expansão de inventário
                        Character.gold ────────┤   (sinks off-chain: queimam ANTES do claim)
                              │ depósito       │
                              ▼                │
                        User.goldBalance (banco)
                              │ claim EIP-712 (mint on-chain)
                              ▼
                        GOLD on-chain ─────────┬── Compras on-chain → TREASURY
                                               ├── Marketplace de itens (P2P)
                                               └── [PROPOSTO] taxa 4% (2% burn / 2% treasury)
```

## Documentos

- [GAME-ECONOMY-DESIGN.md](GAME-ECONOMY-DESIGN.md) — o EDD completo (Fase 2 do plano de documentação).
- [Whitepaper Econômico](../21-whitepaper/WHITEPAPER-ECONOMICO.md) — visão macro, tokenomics, DAO, anti-inflação.
- [Simulador + planilha 10 anos](../22-tokenomics/README.md).
