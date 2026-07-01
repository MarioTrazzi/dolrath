# Redesenho de Combate — Sistema de Ataque-por-Arma

> Documento de design (2026-06-21). Decidido com o Mario a partir das simulações de
> `scripts/late-game-gear-sim.js`. Objetivo: balancear o end-game (nv50, lendário IV)
> e dar um combate que **escala pra sempre** sem tetos de stat.

## Por que mudar

No modelo atual o dano vem de **multiplicadores de stat sem teto** (ex: ataque pesado = `STR×1.8`).
No end-game com gear lendário IV, isso deixa o gear valer ~90% do poder de combate e o
Guerreiro em ~88% de vitória (Mago em ~28%). Subir pontos por nível **piora** (amplifica a
assimetria dos builds). A raiz é o modelo de combate, não só o gear.

## Princípio central

O **dano principal vem da ARMA** (poder-base do item), não de um stat que explode. O stat
**modula** o dano. Assim o balanceamento é **tuning de catálogo** (você controla o poder de
cada arma), escala pra sempre (basta adicionar armas de tier maior), e diversifica o combate
(cada arma = um ataque diferente).

## Decisões tomadas

1. **Ataque primário = arma.** Fórmula:
   ```
   dano_base  = (poder_da_arma × mult_aprimoramento) + (stat_principal × WSCALE)
   dano       = dano_base × sorte_do_dado        (mantém o dado multiplicativo)
   dano_final = mitigação_proporcional(dano, DEF ou RES)
   ```
   - `poder_da_arma`: campo novo `atk` no item; escala com raridade **e** aprimoramento.
   - `WSCALE` **forte (~0.5–0.6)**: o stat ainda pesa bastante no dano (build importa muito).

2. **Mitigação PROPORCIONAL** (`DR = armadura/(armadura+K)`), não subtrativa. Obrigatória:
   com dano de arma (menor), a subtrativa deixa o tanque imortal **e** incapaz de matar → empates.
   Proporcional escala pra sempre, sem imunidade.

3. **Cada arma define seu ataque** (stat, tipo de dano, dado/swing, efeito):

   | Arma | Stat | Tipo | Swing | Assinatura |
   |---|---|---|---|---|
   | Espada (1H) | STR | físico | d10 | equilibrada (com escudo) |
   | Machado (2H) | STR | físico | d12 | mais dano, mais stamina, sem escudo |
   | Adaga (dual) | AGI | físico | d6 | combo de 2 golpes |
   | Arco (2H) | AGI | físico | d10 | perfura parte da DEF |
   | Cajado (2H) | INT | **mágico** | d10 | a "bola de fogo" (mitigada por RES) |
   | Orbe (sec.) | INT | mágico | — | 2º feitiço / amplifica |
   | Manopla (dual) | AGI | físico | d6 | combos rápidos (Monge) |
   | Escudo (sec.) | — | — | — | defensivo: + DEF e bloqueio |

4. **Dual-wield = orçamento de UMA arma dividido** entre as mãos (empunhar 2 não dobra o
   poder). Conserta a inflação de stat das classes AGI que quebra o balanceamento.

5. **Mago: ataque mágico primário sustentável** (a "bola de fogo" que evolui) — escala com INT,
   MP baixo, mitigado por RES. Sobe o piso do mago (no sim: 25%→39%).

6. **Defesa = duas reações amarradas a stats** (e narradas pela IA):
   - **Esquiva (AGI):** aposta — chance de **zerar** o golpe, risco de levar cheio. Ferramenta do ágil.
   - **Bloqueio (DEF):** garantido — reduz um **pedaço** (amplifica a armadura efetiva no golpe).
     Ferramenta do tanque. A IA narra como "aparou com escudo / defendeu com a arma".

7. **Sem tetos de stat** (MMO escala pra sempre). O controle vem da arma + mitigação proporcional.

8. **Arquétipos:**
   - Guerreiro = tanque: muita DEF/HP, dano de arma **menor**, bloqueia.
   - Ladino = glass cannon físico: dano alto, frágil, esquiva.
   - Mago = glass cannon mágico: dano alto (bola de fogo, fura via RES baixa dos não-tanques), frágil.
   - Monge = **bruiser de dano sustentado**: muitos golpes médios, armadura média, sem burst nem muralha.

## Pontos EM ABERTO (precisam de decisão antes de implementar)

O sim revelou dois problemas compostos que travam o Guerreiro (~11%) e inflam o Monge (~74%):

- **(A) STR de gear < AGI de gear.** A secundária do Guerreiro é um escudo (zero ofensivo),
  então o "forte físico" tem o **menor** stat principal e o menor dano. → Decidir: o poder de
  arma do Guerreiro compensa? O escudo dá algum ofensivo? Armas 2-mãos do Guerreiro são bem mais fortes?
- **(B) AGI = esquiva (e é barata).** Classes que empilham AGI (Monge) **esquivam tudo** e o
  Guerreiro (AGI baixa) não acerta. O bloqueio não resolve (o problema é não ACERTAR). → Decidir:
  esquiva custa stamina alta (não dá p/ spammar)? Existe stat de **precisão**? Ataques pesados são
  mais difíceis de esquivar? AGI dá menos esquiva?

Resolver (A) e (B) é o que falta para fechar o balanceamento. A direção provável:
normalizar o stat principal entre classes + limitar o spam de esquiva (stamina/precisão).

## Ferramentas

`scripts/late-game-gear-sim.js` modela tudo isto via env:
`WPNMODE=1 MITPROP=1 MITK=300 WSCALE=0.5 WPN_WAR/ROG/MAG/MNK=.. DUALNORM=1 MAGEFIX=1
BLOCKMULT=4.5 AGICAP=999`. Rodar sem env = produção atual (baseline).

## ⭐ MODELO ENXUTO (revisão final — `scripts/lean-combat-sim.js`)

O acúmulo de mecânicas (físico/mágico + esquiva + bloqueio + crítico + especial…)
ficou **caótico de calibrar** (cada lever brigava com os outros). Decidido simplificar
para um modelo de **poucos levers limpos** — sem perder as decisões de design:

- **Dano = `poder_da_arma × (1 + stat×k) × SORTE`** — uma fórmula só. Arma = base (lever de
  catálogo), stat = multiplicador.
- **Mitigação UNIFICADA**: `DR = armadura/(armadura+K)`, vale para TODO dano. Físico/mágico
  vira **flavor narrado pela IA**; "resistência mágica" é só mais armadura. (Acaba o Mago-fura-tudo.)
- **Defesa**: Esquiva (AGI, custa stamina) como modificador; bloqueio = a armadura passiva.
- **Cada classe = 3 levers**: PODER (dano) · ARMADURA+HP (sobrevivência) · EVASÃO.

### 🎲 O dado decide (validado)
A sorte é uma **banda multiplicativa** no dano. O que faz a sorte mudar o RESULTADO não é a
largura da banda (numa luta longa ela se anula na média) e sim a **luta ser CURTA**:
- ~5 golpes decisivos → gap de +12% de poder ≈ **59% win** (o mais fraco vence ~41%). ✅
- ~14 golpes → +12% ≈ 68% (favorito domina).
→ **Princípio de design: combate punchy (~5 golpes decisivos)**, dano alto vs HP. Não atrito.

### ⚖️ Condição de equilíbrio (validada)
Para um 1v1 ~par: **`PODER × EHP ≈ constante` entre as classes** (quem bate mais forte morre
mais rápido, na mesma proporção). `EHP = HP / (1−DR) / (1−evasão_efetiva)`.
- Tanque = pouco poder, muito EHP. Glass cannon = muito poder, pouco EHP. Bruiser = meio-termo.
- Como o gap de ~12% é coberto pelo dado, basta as classes ficarem **dentro de ~15%**.

### Como isto resolve A e B
- **A** (dano do guerreiro): some — o dano vem do PODER (lever direto por classe), não do stat
  de gear assimétrico. 2-mãos = mais poder, escudo = mais EHP (a escolha de build do guerreiro).
- **B** (AGI esquiva tudo): some — evasão é um lever calibrado por classe (não o empilhamento
  cru de AGI), e custa stamina. A AGI volta a "render dano", não invencibilidade.

### ✅ Perfis FINAIS travados (nv50, gear lendário IV) — 4 levers por classe
Calibração final (matriz inline confiável, 20k lutas/par). Valores EFETIVOS de end-game
(gear+stats já dobrados) — o que a implementação real precisa REPRODUZIR. Dial de punch =
**moderado (HP ×0.6)**, escolhido pelo Mario:

| Classe | PODER | ARMADURA | HP | EVASÃO | Arquétipo |
|---|---|---|---|---|---|
| Guerreiro | 102 | 160 | 438 | 0.05 | tanque |
| Ladino | 160 | 55 | 282 | 0.30 | glass cannon físico |
| Mago | 175 | 50 | 312 | 0.18 | glass cannon mágico |
| Monge | 132 | 120 | 316 | 0.22 | bruiser |

Dado: banda `[0.55, 1.75]` × crit `1.6` (rolagem máx) em d12. Mitigação `K=220`. Esquiva
custa 3 stamina (regen 2/turno, máx 6).

**Resultados validados:**
- 🎯 **Gear igual → spread de classe 2.1%** (todo confronto 48-52%). Meta ≤5% batida.
- 🎲 **Gear −12% → azarão vence**: Guerreiro 18% · Ladino 37% · Mago 37% · Monge 32%.
- Lutas de 3-11 golpes (punchy).

O Guerreiro é o mais "consistente" (azarão 18%, lutas mais longas por ser o arquétipo
extremo) — aceito como temático (tanque = confiável, ladino = swingy).

## ⭐⭐ RELAÇÃO CLASSE × EQUIP × NÍVEL — escala uniforme (validado em TODOS os níveis)

Decidido com o Mario (2026-06-22): identidade de classe = **multiplicador FIXO (a FORMA)**
sobre uma **base S que cresce com nível+gear (o seu PODER)**. `scripts/progression-sim.js`.

```
levers_da_classe = PERFIL_da_classe × S
K (mitigação)    = K50 × S
evasão           = PERFIL.evasão   (% é invariante de escala)

S = wL × (nível/50) + wG × (tier_do_gear)        // wL=wG=0.5 (gear não-dominante)
```

- **PERFIL** = os 4 levers equilibrados do nv50 (a FORMA): Guer 102/160/438/.05 · Lad
  160/55/282/.30 · Mag 175/50/312/.18 · Monge 132/120/316/.22.
- Como TUDO (poder, armadura, HP, K) escala por `S`, o combate em qualquer nível é só uma
  **versão escalada do nv50** → o equilíbrio do nv50 vale em TODOS os níveis, por construção.

**Validado (12k lutas/par):**
- 🎯 **Spread de classe ≤2.7% em TODOS os níveis** (50→2.7, 40→2.2, 30→1.5, 20→2.1, 10→2.4, 1→1.7).
- 🎲 **Gear −25% → azarão vence**: Ladino 39% · Mago 37% · Monge 30% · Guerreiro 16%.

### Implicação de design (Mario aceitou)
Com escala uniforme, **distribuir pontos não muda a FORMA da classe** (senão quebraria o
equilíbrio). Os atributos (STR/AGI/INT/DEF) alimentam o seu PODER (a parte `nível` de S),
e a CLASSE define a forma (os multiplicadores). Isto muda os sistemas atuais de
distribuição de pontos / criação (a definir na implementação): atributos viram poder, não
shape livre.

## Ataques e transformação (decidido 2026-06-22)

Três ataques, recurso UNIFORME por construção (preserva o equilíbrio):
- **Básico** (sem custo): poder×0.72. Fallback.
- **Ataque da arma** (da classe): poder×1.0 = o `power` equilibrado. O principal.
- **Especial**: poder×1.5 — **só disponível com a TRANSFORMAÇÃO ativa** (ideia do Mario).
  A transformação já é o gate (custo/duração/cooldown próprios, ~simétricos entre raças),
  então não precisa de recurso novo nem barra nova. Validado: 3 ataques simétricos mantêm
  spread ≤2.4%.

**Transformação no modelo novo** = buff temporário SIMÉTRICO nos levers (ex. poder/HP ×fator
por N turnos) + libera o especial. Por ser simétrico, preserva o equilíbrio de classe.
⚠️ ESCOPO: o modelo validado é por CLASSE; RAÇAS + transformações ainda não foram modeladas
no progression-sim (class-only). Integração de baixo risco (simétrica), mas é trabalho a fazer
— inclui as armas lendárias de raça alimentarem o tier do gear de forma comparável entre raças.

### Status: DESIGN do combate COMPLETO ✅ — INTEGRAÇÃO ao vivo pendente
Próximos passos (fase de implementação, ainda não iniciada):
1. Mapear gear+stats reais → os 4 levers efetivos (poder/armadura/HP/evasão) por classe.
2. Adicionar campo `atk` (poder da arma) aos itens; trocar a fórmula de dano.
3. Portar p/ PvP (`server/socket-server.js`) e PvE (`src/components/dungeon/DungeonRun.tsx`),
   mantendo a fórmula única + mitigação unificada + esquiva.
4. Revalidar masmorras (dificuldade do PvE muda com o novo combate).

Sims: `scripts/lean-combat-sim.js` (⚠️ bug no display da matriz — usar a matriz inline p/
números confiáveis; o motor de luta em si está correto).

## Já enviado (parcial, independente deste redesenho)

- `enhancementSystem.ts`: curva achatada (+5%/nv, IV ×4→×2.2).
- `itemCatalog.ts`: DEF −30% nas peças pesadas/escudos lendários/épicos.
- Efeito: spread do end-game 70→58 (melhora parcial; o fechamento é este redesenho).
