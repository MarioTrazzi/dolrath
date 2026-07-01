# 15 — Raids

> **Status: EM BREVE** — o combate atual é solo (PvE) e 1v1 (PvP). Raids são a fase cooperativa do roadmap, dependem de Guilds.

## Visão

Raids são masmorras cooperativas (3–5 jogadores) com bosses que exigem composição de classes — o conteúdo onde o balanceamento raça×classe vira estratégia de grupo.

## Desenho resumido

- **Estrutura:** 3 alas + boss final; checkpoints; lockout semanal (1 clear com loot por semana — controle de faucet).
- **Mecânicas de composição:** boss com fases que punem grupo sem Mago (escudo arcano) ou sem Guerreiro (tank de linha) — reaproveita o modelo de levers do PvP.
- **Loot:** materiais raros exclusivos (Estilhaço de Memória em quantidade, receitas de craft raras), rolagem por jogador (personal loot, sem drama de guilda).
- **First-kill de temporada:** recompensa em DOL do bucket de conquistas + título soulbound.

## Economia

- Entrada consome stamina de todos + taxa de convocação em GOLD (sink social).
- Loot é majoritariamente **material** (empurra para o craft), GOLD apenas simbólico.
- Lockout semanal impede farm industrial.

## Dependências técnicas

Sincronização multi-jogador no combate PvE (hoje o socket server só suporta PvP 1v1); estado de raid persistente compartilhado (evolução do model `DungeonRun`).
