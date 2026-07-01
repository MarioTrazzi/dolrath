# 30 — Balancing

## Metodologia (pilar 5)

**Nenhuma mudança de balance vai a produção sem simulação.** O repositório mantém a suíte em `scripts/`; cada rebalance roda milhares de lutas e compara win-rates antes/depois. Quando doc e código divergem, o simulador decide.

## Suíte de simuladores

| Script | O que mede | Resultado de referência |
|---|---|---|
| `pvp-race-class-sim.js` | 16 combos raça×classe, base e transformado | raças 46–55%, classes 43–58% ✅ |
| `pvp-lever-sim.js` | modelo de levers do PvP (⚠️ cópia stale dos especiais) | — |
| `pvp-balance-sim.js`, `pvp-fight-detailed-sim.js` | lutas detalhadas PvP | — |
| `dungeon-difficulty-sim.js` | curva PvE; papel do gear | **gear é obrigatório** ✅ |
| `pve-race-class-sim.js`, `pve-full-run-sim.js` | PvE por combo; run completa | boss ~75%, run ~58% ✅ |
| `late-game-gear-sim.js` | BiS real nv50 | detectou spread 70 (Guer 88/Mago 28) → correções |
| `dungeon-loot-sim.ts`, `progression-sim.js` | loot e progressão | — |
| `lean-combat-sim.js` | redesign PvE lean | — |
| `token-economy-sim.js` | economia 10 anos (Fase 3 da doc) | ver [Tokenomics](../22-tokenomics/README.md) |

## Lições aprendidas (registradas para não repetir)

1. **Aumentar pontos/nível desequilibra a base** — o poder deve vir de gear e escolhas, não de inflação de stats.
2. **O combate premia DEF/sobrevivência** — mago fraco crônico até o modelo dado-como-plus encolher o spread.
3. **Wisdom morta:** o servidor ignora SAB; qualquer rebalance que a mencione está olhando dados errados.
4. **Boss domina o faucet** — balance econômico começa pelo boss, não pelos monstros comuns.
5. **Fonte da verdade única:** stats do servidor vêm de `gameData.ts`; transformação de `transformationSystem.ts` (handlers antigos são código morto).

## Processo de rebalance

1. Hipótese com métrica-alvo (ex.: "Monge 43%→48%").
2. Mudança atrás de simulação; rodar suíte relevante.
3. Comparar tabela antes/depois no PR/commit.
4. Deploy + monitorar win-rates reais por 1 semana (LiveOps).
5. Registrar a lição neste documento.
