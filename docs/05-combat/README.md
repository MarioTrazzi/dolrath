# 05 — Combat

## Kit de habilidades (PvE e PvP)

Fonte: `src/lib/combatModel.ts`, `src/lib/transformationSpecials.ts`, doc detalhado em [combate-ataque-por-arma.md](combate-ataque-por-arma.md).

| Habilidade | Dado | Custo | Observação |
|---|---|---|---|
| Golpe | d6 | — | ataque básico universal |
| Ataque de Classe | d8 | stamina | nome único por classe (ex.: Arcana p/ Mago, alimentada por AP=INT) |
| Especial de Forma | d20 | 12 MP | 1 skill de dano assinatura por forma de transformação |
| 💫 Golpe Atordoante | d20 | 10 MP | compartilhado pelas 6 formas; CONTROLE puro (mult 0,8, sem pierce), rolagem ≥15 (30%) IMOBILIZA o alvo por 1 turno; recarga 3; é o ÚNICO especial esquivável (esquiva passiva do alvo anula, no PvP); chefe PvE resiste ao stun |
| Buff de Forma | — | 8 MP | 1 buff por forma; Fúria Selvagem é exclusiva do Lobo |
| Transformação | — | 1×/luta | multiplicador de stats (piso 1,20), dura o combate +1 turno |

## Resolução de dano — "dado-como-plus"

O modelo atual substituiu a disputa de margem (`contestedOutcome`):

- **Dano = núcleo × sorte**: o núcleo vem dos atributos/gear (AD físico, AP arcano vs DP), o dado **só multiplica** o dano (`resolveHit` / `resolveMonsterHit`).
- **Esquiva é 100% stat** — exceto nat-max no dado, que sempre conecta.
- **O monstro nunca rola dado** — a variância fica toda na mão do jogador (rolagem d20 visível no PvE).
- Resultado: spread entre classes encolheu muito; recalibrado o `BOSS_HP_MULT`.

## Status effects (Floresta)

| Monstro | Skill | Efeito |
|---|---|---|
| Aranha | Presas Envenenadas | veneno (Antídoto cura — deixou de ser item morto) |
| Ent | Raízes Rasteiras | atordoamento |
| Javali | Presas Vorazes | dano direto ampliado |
| Lobo | — | sangramento |

## PvP — modelo de levers

O combate PvP ao vivo usa **classe + nível + gear** como alavancas (não usa stats brutos/raça/forma diretamente); transformação aplica ×1,25 plano. A migração dos especiais de forma para o servidor PvP está em projeto (Fases 2–3 pendentes — ver [PvP](../17-pvp/README.md)). **Decisão de 2026-06-21: gear DEVE contar no PvP** (hoje só baseStats contam) — feature pendente com rebalance dos lendários.

## Animações

`AbilityFX.tsx` mapeia `action`+classe do `BattleEvent` para animações de impacto/aura/esquiva/crit; eventos de buff/status/transform têm FX próprios. Preview em `/dev/battle-fx`. **Toda skill nova precisa registrar `SPECIAL_IMPACT`/`BUFF_AURA`.**

## Redesign em playtest (PvE lean)

Branch `claude/pve-lean-combat`: bands de nível por masmorra, rampa de dificuldade por sala, stamina+MP como custo dos ataques, especial derivado da arma equipada. Monstros recalibrados com boss ancorado e normalização por classe.
