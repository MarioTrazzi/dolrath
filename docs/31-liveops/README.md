# 31 — LiveOps

> **Status: PARCIAL** — as alavancas existem; o calendário de operação formal começa com Seasons.

## Alavancas de operação disponíveis HOJE

| Alavanca | Onde | Efeito |
|---|---|---|
| `DUNGEON_DAILY_GOLD_CAP` (env) | teto diário de emissão por usuário | controla a emissão global sem redeploy |
| Recompensa do boss / tierFactor | `dungeonAdventures.ts` | boss domina o faucet — a alavanca fina da emissão |
| Preços de catálogo | `itemCatalog.ts` (124 itens) | força dos sinks da loja/forja/alquimia (taxas são % do catálogo) |
| Bônus PvP (first-win, perfeita) | `battle/rewards` | incentivo de engajamento diário |
| Stamina | `staminaSystem.ts` | ritmo de sessões |

## Playbook de incidentes econômicos

1. **Exploit de emissão detectado:** derrubar a env do cap para valor baixo (efeito imediato), desativar rota afetada (fail-closed, padrão 410 já usado), auditar `DungeonRun`/claims do período, comunicar antes de reverter saldos.
2. **Inflação acima da meta (sink/faucet < 0,6 por 2 semanas):** subir taxas % de forja/alquimia primeiro (sinks proporcionais doem menos que nerf de faucet), depois recompensa de boss.
3. **Deflação/atrito demais (reclamação + queda de sessões):** evento de bônus temporário — nunca subir o faucet base sem simulação.

## Calendário alvo (com Seasons — EM BREVE)

- **Semanal:** rotação de affixes de masmorra; world boss aos sábados.
- **Por temporada (~10 sem.):** tema novo, reset de rankings, passe, loja rotativa.
- **Trimestral:** revisão pública de tokenomics (relatório de emissão/burn real vs simulado).

## Regra de ouro

Toda mudança de LiveOps que toque emissão/queima entra no relatório mensal público (confiança > esperteza — mudanças silenciosas de economia destroem comunidades Web3).
