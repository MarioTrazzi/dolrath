# 16 — Bosses

## Estado atual

Cada masmorra termina em um boss; a Floresta Sombria tem o boss calibrado e com arte própria (Aranha-Rainha).

## Números que importam (fonte: `src/lib/dungeonAdventures.ts`)

- **Recompensa do boss:** `(150 + rand×150) × dificuldade × tierFactor` — contra 25–50 da sala principal e 6–16 do nó menor. **O boss domina o faucet** (tierFactor chega a 3,4 nas Ruínas).
- **HP do boss:** ancorado via `BOSS_HP_MULT`, recalibrado para o modelo dado-como-plus.
- **Win-rate alvo:** ~75% na luta do boss da Floresta; **~58% na run completa** (intencional — a masmorra inteira é o desafio, não só o boss).

## Papel econômico do boss

O boss é a **alavanca de LiveOps da emissão**: como ele domina o faucet de GOLD, ajustar a recompensa do boss (ou o tierFactor) move a emissão diária inteira sem tocar no resto do jogo. Qualquer evento de "boss em dobro" precisa passar pela checagem de teto diário (`DUNGEON_DAILY_GOLD_CAP` continua valendo).

## Status effects e mecânicas

Bosses herdam o sistema de status da masmorra (veneno, stun, sangramento — ver [Combat](../05-combat/README.md)). Redesign em playtest adiciona rampa de salas que chega "quente" no boss.

## EM BREVE

- **World bosses** de evento (spawn público, contribuição ranqueada, recompensa em DOL para o topo).
- **Bosses de raid** com mecânicas de composição (ver [Raids](../15-raids/README.md)).
- Arte própria para os bosses de Caverna, Pântano e Ruínas (pipeline: [Art Direction](../27-art-direction/README.md)).
