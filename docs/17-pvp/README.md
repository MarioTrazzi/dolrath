# 17 — PvP

## Estado atual (AO VIVO)

Arena 1v1 em tempo real via Socket.IO (`server/socket-server.js`), com animações por habilidade (`AbilityFX.tsx`).

### Modelo de combate — "levers"

O PvP ao vivo usa um modelo enxuto de alavancas: **classe + nível + gear** (transformação = ×1,25 plano). Stats brutos/raça/forma não entram diretamente — isso mantém o balance PvP controlável por poucas variáveis.

⚠️ **Débito conhecido (decisão 2026-06-21):** hoje o gear **NÃO** conta no PvP (só baseStats). A feature de ligar gear + rebalance dos lendários está pendente — é a prioridade #1 desta seção. A fonte real da transformação é `transformationSystem.ts` (o handler antigo no socket é código morto).

### Recompensas (fonte: `src/app/api/battle/rewards/route.ts`)

| Resultado | GOLD base | XP |
|---|---|---|
| Vitória | 15 | maior |
| Empate | 8 | médio |
| Derrota | 5 | consolação |

Multiplicadores: ×1,08^nível; **vitória perfeita ×1,5**; kill transformado ×1,2; **first-win-of-day ×1,5**; bônus de azarão (underdog) e penalidade de bully por diferença de nível. A rota exige sessão + posse do participante (o bypass por user-agent foi removido em 2026-06).

## Balanceamento

Validado por `scripts/pvp-race-class-sim.js` (16 combos raça×classe, base e transformado): raças 46–55%, classes 43–58% de win-rate. Migração dos especiais de forma para o servidor PvP: Fases 2 (servidor) e 3 (cliente) pendentes; `pvp-lever-sim.js` tem cópia stale dos especiais — sincronizar antes de usar.

## EM BREVE

- **Gear no PvP** (prioridade #1) + rebalance de lendários.
- **PvP ranqueado por temporada:** MMR simples (Elo), ligas (Bronze→Grão-Mestre), recompensa de fim de season em DOL + cosméticos para o topo (nunca GOLD escalável — evita farm de fila).
- **Torneios:** inscrição em GOLD (sink), premiação majoritária em DOL/cosméticos, chave eliminatória.
- **Apostas espectador** (GOLD, com taxa/rake para o treasury) — fase posterior, exige anti-colusão.
