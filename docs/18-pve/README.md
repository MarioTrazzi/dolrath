# 18 — PvE

## Loop central (AO VIVO)

**Entrar na masmorra (stamina) → explorar salas → lutar (dados visíveis) → lootear (gold/materiais/itens) → voltar → craftar/equipar → masmorra mais funda.**

Sem penalidade de morte destrutiva: derrota encerra a run mantendo o que foi ganho até ali — a filosofia é "progressão sem punição", o gate é a stamina diária.

## Estrutura de uma run (fonte: `src/lib/dungeonAdventures.ts`, `dungeonRunServer.ts`)

- **Salas principais** (obrigatórias): monstro calibrado + recompensa 25–50 GOLD ×d×tier.
- **Nós menores** (opcionais): pacote de 1–3 monstros mais fracos, XP por abate individual, chip de fustigamento, auto-mira no mais fraco, **recuar mantendo o XP** — resolve o "muro do nível 1".
- **Eventos:** ouro (goldPerLevel 15–100/nível conforme masmorra), armadilha, bênção, fonte (cura), nada.
- **Boss:** âncora da run (ver [Bosses](../16-bosses/README.md)).

Tudo é **servidor-autoritativo**: o servidor rola o d20, decide o loot e credita gold/XP/itens no model `DungeonRun`; o cliente só apresenta. Teto diário de GOLD por usuário (default 20.000).

## Combate PvE

Modelo dado-como-plus: dado multiplica dano, esquiva é stat pura, monstro não rola (ver [Combat](../05-combat/README.md)). Gear entra com atributos REAIS (bug do `bonusDefense` ignorado foi corrigido — commit 96309b8); o simulador `scripts/dungeon-difficulty-sim.js` confirma que **gear é obrigatório** na curva de dificuldade.

## Win-rates alvo (medidos)

| Conteúdo | Alvo |
|---|---|
| Luta do boss (Floresta, personagem adequado) | ~75% |
| Run completa da Floresta | ~58% |
| Saldo líquido de GOLD por run (com consumo de poções/reparo) | **negativo** (~-1.000 a -2.300) — a run paga em progresso, não em ouro livre |

## Redesign em playtest (branch `claude/pve-lean-combat`)

Bands de nível por masmorra, rampa de dificuldade nas salas, stamina+MP como custo de ataque, especial derivado da arma. Monstros recalibrados (boss ancorado, normalizado por classe). Vai a main após playtest.

## EM BREVE

- Masmorras infinitas/endless com scaling (leaderboard semanal).
- Modificadores diários de masmorra (affixes) para variedade de farm.
- Raids cooperativas (ver [Raids](../15-raids/README.md)).
