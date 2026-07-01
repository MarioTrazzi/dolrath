# 04 — Classes

## Raças (4)

Fonte da verdade: `src/lib/gameData.ts` (o servidor usa este arquivo; `characterCreationData.ts` é só apresentação).

| Raça | Identidade | Transformação (1×/luta, dura +1 turno após buff) |
|---|---|---|
| Humano | Versátil, equilibrado | Forma ancestral própria |
| Draconiano | Casca grossa, presença de campo | Forma dracônica |
| Metamorfo | Adaptável, imprevisível | Forma bestial |
| Elfo | Precisão e arcana | Forma élfica superior |

Cada forma concede **1 skill de dano especial (d20, 12 MP)** e **1 buff (8 MP)** próprios; a Fúria Selvagem é compartilhada entre formas (ver [Combat](../05-combat/README.md)). O multiplicador de transformação usa piso "B modesto" (≥1,20 com arredondamento) — fonte: `src/lib/transformationSystem.ts`.

## Classes (4)

| Classe | Papel | Perfil de dano |
|---|---|---|
| Guerreiro | Linha de frente, sobrevivência | FOR, dano físico pesado |
| Ladino | Dano por agilidade | AGI vira dano (peso 1,6 no poder unificado) |
| Mago | Dano arcano | INT alimenta AP e a skill Arcana |
| Monge | Híbrido de nicho | Equilíbrio corpo/espírito |

O poder de combate unificado é **ponderado por classe** no `combatModel` — cada classe converte atributos em poder com pesos próprios, o que garante que buildar o atributo "da classe" sempre compensa.

## Atributos

- **FOR / AGI / INT / CON** ativos no combate; **piso 8** em FOR/AGI/INT na criação (nenhum personagem nasce com stat inutilizável).
- **SAB é ignorada pelo servidor** (herança da criação antiga — pontos em SAB são desperdiçados; a UI de criação não a oferece mais).
- Criação distribui **18 pontos** (subiu de 10 após a rodada de balance de 2026-06).

## Estado de balanceamento

Validado por simulação massiva (`scripts/pvp-race-class-sim.js`, 16 combinações raça×classe, com e sem transformação):

- Raças: win-rate entre **46–55%**.
- Classes: win-rate entre **43–58%**.
- PvE raça×classe: draconiano rebalanceado (CON 50→30); boss da Floresta calibrado para ~75% de vitória na luta, ~58% na run completa (intencional).

## Progressão

- Nível máximo: **100** (`src/lib/experienceSystem.ts`); conteúdo atual calibrado até ~nv50 (Ruínas).
- Pontos por nível: cuidado ao mexer — o simulador de late-game mostrou que aumentar pontos/nível desequilibra a base (ver [Balancing](../30-balancing/README.md)).

## EM BREVE

- Subclasses/especializações no nv25 (proposta de design, não iniciada).
- 5ª raça ligada a evento de temporada.
