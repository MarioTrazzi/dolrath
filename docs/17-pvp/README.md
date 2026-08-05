# 17 — PvP

## Estado atual (AO VIVO)

Arena 1v1 em tempo real via Socket.IO (`server/socket-server.js`), com animações por habilidade (`AbilityFX.tsx`).

### Modelo de combate — "levers"

O PvP ao vivo usa um modelo enxuto de alavancas: **classe + nível + gear** (transformação = ×1,25 plano). Stats brutos/raça/forma não entram diretamente — isso mantém o balance PvP controlável por poucas variáveis.

⚠️ **Débito conhecido (decisão 2026-06-21):** hoje o gear **NÃO** conta no PvP (só baseStats). A feature de ligar gear + rebalance dos lendários está pendente — é a prioridade #1 desta seção. A fonte real da transformação é `transformationSystem.ts` (o handler antigo no socket é código morto).

### Recompensas (fonte: `src/lib/pvpRewards.ts` + `src/app/api/battle/rewards/route.ts`)

Ouro e XP são **proporcionais à stamina gasta** na luta (`PVP_GOLD_PER_STA = 31`,
`PVP_XP_PER_STA = 11`), com `PVP_WIN_SHARE = 0,70` do pot para o vencedor e 0,30
para o perdedor. Multiplicadores: ×1,08^nível; vitória perfeita ×1,5; kill
transformado ×1,2; first-win-of-day ×1,5; bônus de azarão e penalidade de bully
por diferença de nível. Piso de entrada `PVP_MIN_ENTRY_STAMINA = 5` mata o farm
de luta de um turno.

A rota é **service-only** (header `x-battle-secret`, chamada pelo socket) — o
bypass por user-agent e o acesso por sessão foram removidos em 2026-06/07.

### Ranqueado por temporada — AO VIVO

Pontuação flat: **+25 por vitória, +5 por derrota** (`PVP_RANK_WIN_POINTS` /
`PVP_RANK_LOSS_POINTS`). Não é Elo — não depende do oponente e não decai.

A temporada tem **inscrição de 100 DOL por herói** — aportada pelo estúdio na
criação do personagem, paga pelo jogador da temporada 2 em diante — e premia o
**top 20** com a soma das inscrições. Herói sem inscrição luta e ganha ouro/XP,
mas não pontua. Detalhes completos, curva de premiação, entressafra e
antifarm: **[19 — Seasons](../19-seasons/README.md)**.

## Balanceamento

Validado por `scripts/pvp-race-class-sim.js` (16 combos raça×classe, base e transformado): raças 46–55%, classes 43–58% de win-rate. Migração dos especiais de forma para o servidor PvP: Fases 2 (servidor) e 3 (cliente) pendentes; `pvp-lever-sim.js` tem cópia stale dos especiais — sincronizar antes de usar.

## EM BREVE

- **Gear no PvP** (prioridade #1) + rebalance de lendários.
- **MMR (Elo) e ligas** (Bronze→Grão-Mestre) por cima da pontuação flat atual.
- **Torneios:** chave eliminatória, financiada pelo cofre de torneios que já
  acumula (sobras do top 20). Inscrição em GOLD como sink adicional.
- **Apostas espectador** (GOLD, com taxa/rake para o treasury) — fase posterior, exige anti-colusão.
