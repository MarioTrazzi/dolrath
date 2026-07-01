# Dolrath — Game Economy Design Document (EDD)

**Versão 0.9 (draft interno) · Julho 2026 · PT-BR**

> Documento operacional da economia do jogo. O [Whitepaper](../21-whitepaper/WHITEPAPER-ECONOMICO.md) explica a macro (tokens, mercado, DAO); este documento cataloga a micro: **cada fonte e cada sumidouro de GOLD, com números e fórmulas do código real**, mais o desenho econômico dos sistemas futuros. Convenção de status: **[AO VIVO]** = em produção; **[PLAYTEST]** = codado em branch; **[EM BREVE]** = design aprovado com roadmap.

---

## Sumário

- [1. Modelo geral](#1-modelo-geral)
- [2. Faucets — tudo que gera GOLD](#2-faucets--tudo-que-gera-gold)
- [3. Sinks — tudo que gasta GOLD](#3-sinks--tudo-que-gasta-gold)
- [4. Fórmulas de combate e recompensa](#4-fórmulas-de-combate-e-recompensa)
- [5. Progressão](#5-progressão)
- [6. Economia PvE](#6-economia-pve)
- [7. Economia PvP](#7-economia-pvp)
- [8. Economia de Craft](#8-economia-de-craft)
- [9. Economia de Bosses](#9-economia-de-bosses)
- [10. Economia do Marketplace](#10-economia-do-marketplace)
- [11. Sistema de Taxas](#11-sistema-de-taxas)
- [12. NFT: mint, aluguel e leilões](#12-nft-mint-aluguel-e-leilões)
- [13. Sistema de Staking](#13-sistema-de-staking)
- [14. Sistema de Seasons](#14-sistema-de-seasons)
- [15. Economia de Guild](#15-economia-de-guild)
- [16. Economia de Terrenos](#16-economia-de-terrenos)
- [17. Economia de Pets](#17-economia-de-pets)
- [18. Economia de Eventos](#18-economia-de-eventos)
- [19. Balanceamento](#19-balanceamento)
- [20. Tabela-mestre de parâmetros](#20-tabela-mestre-de-parâmetros)

---

## 1. Modelo geral

### 1.1 As três camadas do GOLD [AO VIVO]

| Camada | Campo | Entra por | Sai por |
|---|---|---|---|
| Carteira do personagem | `Character.gold` | masmorra, PvP, venda de item | loja off-chain, taxas de forja/alquimia |
| Banco da conta | `User.goldBalance` | depósito (`/api/bank/deposit`) | saque, claim on-chain |
| On-chain | `DolrathGold` ERC-20 | `claimWithSig` (EIP-712) | compras on-chain → treasury; marketplace P2P |

Regra de design: **sinks atacam o saldo antes do claim.** Todo GOLD off-chain é emissão potencial do token; cada gasto off-chain é queima pré-emissão.

### 1.2 Gates de emissão [AO VIVO]

1. **Stamina** por personagem (regen passivo com delay de inatividade — `staminaSystem.ts`) limita sessões de farm.
2. **Teto diário por usuário:** `creditCappedGoldTx` clampa a soma de `DungeonRun.goldEarned` do dia UTC a `DUNGEON_DAILY_GOLD_CAP` (env, default **20.000**). Vale por usuário, não por personagem — multi-char não fura o teto.
3. **Servidor-autoritativo:** o servidor rola dados, decide loot e credita; rotas que confiavam no cliente foram desativadas (410).

### 1.3 Invariantes econômicas (não violáveis por feature nova)

- I1. Nenhuma feature credita GOLD sem passar pelo teto diário ou por revisão econômica explícita.
- I2. Grind nunca paga DOL (só GOLD); DOL só por conquista escassa.
- I3. Equipamento nunca empilha (1 slot/peça) — escassez de slots é sink indireto.
- I4. Preço/recompensa é sempre decidido no servidor.
- I5. Produção passiva (land/pet) emite **materiais**, nunca moeda.

## 2. Faucets — tudo que gera GOLD

### 2.1 Masmorra [AO VIVO] — `src/lib/dungeonAdventures.ts`

Recompensa por sala = `base × d × tierFactor`, onde `d` = dificuldade da masmorra e `tierFactor` cresce por profundidade (passo `TIER_POWER_STEP = 0.6`; chega a ~3,4 no fim das Ruínas):

| Origem | Base (GOLD) | Observação |
|---|---|---|
| Nó menor (opcional, pack 1–3 monstros) | 6 + rand×10 | dividido por `hpShare` se recuar no meio |
| Sala principal | 25 + rand×25 | obrigatória no caminho |
| **Boss** | **150 + rand×150** | domina o faucet |
| Evento "ouro" | goldPerLevel × nível | Floresta 15–35; Caverna 25–50 (veio raro 60–100); Pântano 30–60; Ruínas 35–70 |
| Loot de combate extra | goldBase 4 + var 8 | além de material/consumível/pedra/estilhaço |

**Rendimento medido (simulação):** Floresta nv10 ≈ 4.900/dia/personagem; Ruínas nv50 ≈ 10.900/dia — antes do clamp de 20.000/dia/usuário.

### 2.2 PvP [AO VIVO] — `src/app/api/battle/rewards/route.ts`

Ver [§7](#7-economia-pvp). Base 15/8/5, escala 1,08^nível, bônus até ×1,5. Ordem de grandeza: dezenas de GOLD por luta — PvP é faucet pequeno de propósito (evita farm de fila).

### 2.3 Venda de itens ao jogo [AO VIVO]

`sellPrice = floor(0,6 × preço de catálogo)` — aplicado a drops, consumíveis, ingredientes e materiais (`dungeonRunServer.ts`). O spread de 40% é sink implícito: comprar de volta o que vendeu custa 67% a mais.

### 2.4 Faucets futuros

| Faucet | Regra econômica | Status |
|---|---|---|
| Recompensas de quest diária/semanal | dentro do teto diário; substitui (não soma a) parte do farm | [EM BREVE] |
| Torneios PvP | premiação vem do treasury/inscrições, não de emissão nova | [EM BREVE] |
| Raids | GOLD simbólico; valor real em materiais raros (lockout semanal) | [EM BREVE] |

## 3. Sinks — tudo que gasta GOLD

### 3.1 Loja [AO VIVO] — `src/lib/itemCatalog.ts` (124 itens)

Faixas de preço de catálogo: comuns nv1 90–120; incomuns nv6–7 410–450; escala por raridade/nível até lendários. Dois modos de compra:
- **Off-chain** (`purchase-offchain`): debita `Character.gold` — sink pré-claim (o preferido do design).
- **On-chain** (NFT): GOLD já claimado → transferência para `GOLD_TREASURY_ADDRESS`.

### 3.2 Forja [AO VIVO] — `src/lib/forge.ts`

| Serviço | Custo | Fórmula |
|---|---|---|
| Craft de gear comum/incomum | 30% do catálogo (mín. 10) + materiais | `max(10, round(goldPrice × 0,3))` |
| Refino de pedra | taxa fixa da receita + **10 pedras → 1 concentrada** | razão 10:1 é sink de material |
| Reparo de raro | taxa + Estilhaço de Memória | Estilhaço só dropa em jogo |

### 3.3 Alquimia [AO VIVO] — `src/lib/alchemy.ts`

Taxa `max(5, round(preçoDaPoção × 0,3))` + ingredientes dropados. Craft 100% de sucesso (o custo é a taxa, não RNG). Poções são consumíveis — sink recorrente de verdade (o item deixa de existir no uso).

### 3.4 Expansão de inventário [AO VIVO]

Personagem novo nasce com 20 slots (legados com 10); expansão paga em GOLD. Combinada à regra "equipamento nunca empilha", cria demanda contínua.

### 3.5 Sinks propostos [EM BREVE]

| Sink | Desenho | Nota |
|---|---|---|
| Taxa de marketplace 4% | 2% burn / 2% treasury | entra nos contratos pré-mainnet |
| Respec de atributos | preço progressivo (1º barato, depois dobra) | qualidade de vida paga |
| Manutenção de guilda/land | semanal, proporcional ao nível | sink recorrente estrutural |
| Cosméticos em GOLD | loja rotativa de temporada | sink de status |
| Taxa de leilão (listagem + rake) | anti-spam + captura | ver §12 |
| Pedágio de land (P2P com taxa) | circulação com captura | ver §16 |

### 3.6 Balanço medido [AO VIVO]

Run completa da Floresta consumindo poções/reparos: **líquido -1.000 a -2.300 GOLD**. A masmorra paga progresso (XP, materiais, drops equipáveis), não ouro livre. Este é o alvo de tuning para todas as masmorras.

## 4. Fórmulas de combate e recompensa

Referência completa em [Combat](../05-combat/README.md). O que importa para a economia:

- **Dano = núcleo(atributos+gear) × dado** (dado-como-plus; `resolveHit`/`resolveMonsterHit`). Gear entra com atributos reais → **gear determina até onde você farma** (`dungeon-difficulty-sim.js`: sem gear adequado, a curva para).
- **Esquiva** é 100% stat (exceto nat-max) — previsível para tuning.
- **Monstro não rola dado** — variância só do lado do jogador; recompensa esperada por sala é estável (bom para projeção de faucet).
- **Custos por ação:** Ataque de Classe consome stamina; especiais 12 MP; buff 8 MP [PLAYTEST: stamina+MP em tudo] — consumíveis de MP/stamina viram sink de combate.
- **Recompensa por sala** = `base × d × tierFactor` (ver §2.1); XP por abate individual nos packs.

## 5. Progressão

- **Criação:** 18 pontos, piso 8 em FOR/AGI/INT; SAB ignorada pelo servidor (`gameData.ts` é a fonte).
- **Nível:** XP até nv100 (`experienceSystem.ts`); conteúdo calibrado até ~nv50.
- **Poder real vem de gear**, não de stats por nível (lição do `late-game-gear-sim.js`: inflar pontos/nível desequilibra a base). Consequência econômica: progressão = demanda por craft/loja/marketplace, exatamente onde estão os sinks.
- **Curva de custo do gear:** comum ~100 → incomum ~430 → raro/épico/lendário (dropados/craftados; lendários IV = late-game). Aprimoramento +N via pedras (dropadas + refino 10:1) multiplica a demanda por farm de material.
- **Transformação:** 1×/luta, sem custo em GOLD — poder é gateado por design, não por pay.

## 6. Economia PvE

**Loop:** stamina → run → loot (gold+materiais+XP) → craft/reparo → run mais funda.

| Parâmetro | Valor | Papel econômico |
|---|---|---|
| Custo de entrada | stamina (+ poções levadas) | limita oferta de farm |
| Retorno médio | §2.1, clampado a 20k/dia/usuário | teto do faucet |
| Retorno líquido | negativo em GOLD com consumo (§3.6) | masmorra não é impressora |
| Derrota | mantém ganhos até ali; sem penalidade destrutiva | falha não desincentiva jogar |
| Recuar de pack | mantém XP, gold proporcional ao dano (`hpShare`) | risco/recompensa honesto |
| Win-rate alvo | boss ~75%, run ~58% | fricção intencional |

Materiais por masmorra criam **especialização de farm** (couro/erva na Floresta, minério na Caverna, escama no Pântano, ouro/mithril nas Ruínas) → base do comércio entre jogadores no marketplace.

[PLAYTEST] Redesign lean: bands de nível por masmorra + rampa por sala → farm eficiente exige estar na masmorra do seu nível (protege o tuning de faucet por banda).

## 7. Economia PvP

Recompensas [AO VIVO] (`battle/rewards`):

```
gold = base(15|8|5) × 1,08^nível × diffMult × underdog(≥1)|bully(≤1)
       × perfeita(1,5)? × killTransformado(1,2)? × firstWinOfDay(1,5)?
```

Decisões de design:
1. **PvP é faucet pequeno** (dezenas de GOLD/luta) — recompensa é o ranking, não a moeda; mata o incentivo a farm de fila/colusão.
2. **First-win-of-day ×1,5** — engajamento diário barato.
3. **Underdog/bully** — protege novato, tira valor de bater em nível baixo.
4. Derrota paga 5 base — perder jogando > não jogar.

[EM BREVE — ranqueado]: ligas com reset por temporada; recompensas de fim de season em **DOL + cosméticos** (nunca GOLD escalável); torneios com inscrição em GOLD (sink) e premiação do pote+treasury; gear no PvP (decisão 2026-06-21) liga a economia de itens ao PvP — o custo do gear passa a comprar vantagem competitiva legível.

## 8. Economia de Craft

Cadeia completa [AO VIVO]:

```
masmorra → materiais/ingredientes/pedras/estilhaços
  → Forja: gear (taxa 30% + materiais) · pedra concentrada (10:1) · reparo raro (taxa + estilhaço)
  → Alquimia: poções (taxa 30% + ingredientes) → CONSUMO em combate (item deixa de existir)
  → excedente → venda ao jogo (60%) ou marketplace (P2P + taxa 4% [EM BREVE])
```

Propriedades desejadas (e verificadas):
- **Taxas proporcionais ao catálogo** — sink escala com o poder de compra sem retuning manual.
- **Consumíveis são o sink perpétuo** — poção usada é GOLD+ingrediente destruídos; antídoto ganhou uso real com o veneno da Aranha.
- **10:1 do refino** — compressão de valor: 10 drops comuns viram 1 chance de +N alto.
- **Craft 100%** — zero frustração de RNG; o preço é o custo, não a sorte.

[EM BREVE]: profissões com XP, receitas raras dropadas de boss (colecionável), craft de cosméticos.

## 9. Economia de Bosses

O boss é **a alavanca-mestra do faucet** (§2.1: base 150–300 × d × tierFactor ≤ 3,4 — domina a emissão diária).

Implicações operacionais:
1. Tuning de emissão começa e termina no boss ([LiveOps](../31-liveops/README.md)).
2. Evento "boss em dobro" respeita o teto diário automaticamente (clamp no crédito).
3. Boss é também o gate de progressão (win ~75%) — recompensa alta com fricção real.
4. [EM BREVE] World boss: contribuição ranqueada paga **DOL de conquista** ao topo (não GOLD em massa) + drop cosmético; raid boss paga material raro com lockout semanal.

## 10. Economia do Marketplace

[AO VIVO] Mercado de itens em GOLD (escrow on-chain, lazy-mint na listagem); [LAUNCH] mercado de personagens em DOL. Detalhe: [Marketplace](../11-marketplace/README.md).

Papel na economia do jogo:
- **Preço de referência:** o catálogo dá o teto (loja) e o piso (venda ao jogo, 60%) — o P2P vive no spread de 40%, onde +N congelado e raridade dropada criam prêmio.
- **Comércio de especialização:** quem farma Caverna vende minério p/ quem quer craftar; a divisão de materiais por masmorra (§6) é o motor da oferta.
- **Captura de valor [EM BREVE]:** taxa 4% (2% burn / 2% treasury) — único ponto onde a circulação P2P alimenta o sistema.
- **Anti-RMT:** mercado oficial barato e seguro torna o mercado negro irrelevante.

## 11. Sistema de Taxas

Consolidação (regra: taxa sempre proporcional, nunca fixa em valores que a inflação corrói):

| Taxa | Valor | Destino | Status |
|---|---|---|---|
| Forja (craft) | 30% catálogo, mín. 10 | sink off-chain | [AO VIVO] |
| Alquimia | 30% da poção, mín. 5 | sink off-chain | [AO VIVO] |
| Spread de venda ao jogo | 40% implícito | sink off-chain | [AO VIVO] |
| Marketplace itens | 4% (2% burn / 2% treasury) | on-chain | [LAUNCH] |
| Marketplace personagens | 5% em DOL (2,5/2,5) | on-chain | [LAUNCH] |
| Listagem de leilão | anti-spam simbólica + rake 4% no martelo | on-chain | [EM BREVE] |
| Aluguel de NFT | 5% do split do dono | on-chain | [EM BREVE] |
| Claim de GOLD | 0% (só gas) — decisão: não taxar a saída, taxar a circulação | — | [AO VIVO] |

## 12. NFT: mint, aluguel e leilões

**Mint [AO VIVO]:** lazy-mint por voucher EIP-712; jogador paga só gas; `+N` congelado no mint; trava anti-duplicação de 20 min no inventário; confirmação queima a linha off-chain. Personagem: metadata viva (XP/nível ao vivo).

**Aluguel [EM BREVE]:**
- Dono lista personagem/item com split de GOLD ganho (ex.: 70 locatário / 30 dono; livre por listagem) e duração.
- Split imposto por contrato no crédito do faucet — locatário nunca custodia a parte do dono.
- Taxa de protocolo: 5% da parte do dono.
- Guarda-corpos: personagem alugado não pode ser vendido/queimado; XP ganho fica no personagem (valoriza o ativo do dono); teto diário conta na conta do **locatário** (anti-sybil de faucet).

**Leilões [EM BREVE]:**
- Leilão inglês com duração fixa (24–72h) para lendários e personagens raros; incremento mínimo 5%; anti-snipe +5 min.
- Rake 4% no martelo (mesmo split burn/treasury); taxa de listagem simbólica anti-spam.
- Lances em escrow; devolução automática ao ser superado.

## 13. Sistema de Staking

[LAUNCH] — especificação no [Whitepaper §14](../21-whitepaper/WHITEPAPER-ECONOMICO.md#14-staking). Resumo operacional: locks 3/6/12/24m; recompensas = 20% de cada epoch do bucket Play & Achieve + 50% das taxas do treasury (distribuição trimestral por governança); veDOL para voto; sem APY prometido. Alvo: 30–40% do circulante em stake.

Ligação com o jogo [ROADMAP]: tiers de stake dão cosméticos e prioridade de evento — **nunca poder de combate** (invariante I2 vale para stake também: dinheiro não compra vantagem).

## 14. Sistema de Seasons

[EM BREVE] — desenho em [Seasons](../19-seasons/README.md). Contrato econômico da temporada (~10 semanas):

| Item | Orçamento |
|---|---|
| DOL distribuído (rankings, world boss, first-kills) | epoch fixo = fração do orçamento anual do bucket (25% do saldo restante/ano) |
| Passe premium | preço em DOL (50% burn) ou fiat; trilha grátis paga GOLD/cosmético básico |
| Loja de temporada | sinks de GOLD e DOL; cosméticos nunca reeditados |
| Reset | rankings zeram; poder/itens NÃO zeram (respeito ao tempo investido) |

Invariante: **orçamento de epoch nunca estoura** — se a temporada bombar, o que sobe é o valor do cosmético/passe, não a emissão.

## 15. Economia de Guild

[EM BREVE] — desenho em [Guilds](../13-guilds/README.md). Síntese econômica: fundação cara (sink), hall com níveis pagos em GOLD+materiais (sink coletivo), manutenção semanal (sink recorrente), banco compartilhado auditável; recompensas de ranking em DOL/cosmético — **guilda é sink estrutural, nunca faucet**.

## 16. Economia de Terrenos

[EM BREVE] — desenho em [Lands](../14-lands/README.md). Regras econômicas duras: produção = **materiais, nunca moeda** (I5); manutenção semanal em GOLD > 0; oferta em ondas pequenas gateadas por MAU (`jogadores/terrenos > limiar`); venda primária em DOL (≥30% burn); pedágio P2P com taxa de protocolo.

## 17. Economia de Pets

[EM BREVE] — coleção limitada em DOL (ondas gateadas, como lands). Papel: **conveniência e identidade, não poder** — pet coleta loot automaticamente, carrega slots extras, tem skins; nunca luta nem multiplica faucet. Custos recorrentes: alimentação com consumíveis da alquimia (novo sink para ingredientes de baixo valor). Breeding fora do escopo (multiplicação de oferta destruiu os jogos que tentaram).

## 18. Economia de Eventos

[EM BREVE — calendário; alavancas AO VIVO]

| Evento | Mecânica | Regra econômica |
|---|---|---|
| Fim de semana de bônus | XP/drop de material ↑ | **nunca** bônus de GOLD bruto (teto continua) |
| World boss | contribuição ranqueada | DOL de conquista p/ topo; cosmético p/ participação |
| Invasão de masmorra (affix) | modificador semanal | varia o farm sem mexer no faucet base |
| Torneio PvP | inscrição em GOLD (sink) | premiação = pote + treasury; rake 10% |
| Caça ao tesouro de temporada | puzzle no mundo | prêmio único (colecionável), não moeda |

Toda mudança de evento que toque emissão passa pelo relatório mensal público ([LiveOps](../31-liveops/README.md)).

## 19. Balanceamento

Metodologia e suíte completa em [Balancing](../30-balancing/README.md). Compromissos econômicos:

1. **Simulação antes de produção** — mudanças de faucet/sink rodam `token-economy-sim.js` + sims de combate relevantes.
2. **Estado validado hoje:** raças 46–55% WR; classes 43–58%; boss ~75%/run ~58%; gear obrigatório na curva PvE; run líquida negativa em GOLD.
3. **Bandas de alarme** (checagem semanal): sink/faucet < 0,6 → subir taxas %; WR de classe fora de 45–55 → rebalance simulado; emissão > P95 → investigar exploit.
4. **Mudança gradual:** ajustes de preço/recompensa em passos ≤ 15% por semana — nunca choque.

## 20. Tabela-mestre de parâmetros

| Parâmetro | Valor atual | Onde | Alavanca de |
|---|---|---|---|
| `DUNGEON_DAILY_GOLD_CAP` | 20.000/dia/usuário | env | emissão global |
| Boss base | 150–300 × d × tier | `dungeonAdventures.ts` | faucet dominante |
| Sala principal | 25–50 × d × tier | idem | faucet médio |
| Nó menor | 6–16 × d × tier | idem | faucet pequeno |
| `TIER_POWER_STEP` | 0,6 | idem | rampa de recompensa |
| PvP base W/D/L | 15/8/5 (×1,08^nv) | `battle/rewards` | faucet PvP |
| First-win-of-day | ×1,5 | idem | engajamento |
| Venda ao jogo | 60% do catálogo | `dungeonRunServer.ts` | piso de preço |
| Taxa forja | 30% (mín. 10) | `forge.ts` | sink proporcional |
| Taxa alquimia | 30% (mín. 5) | `alchemy.ts` | sink proporcional |
| Refino | 10:1 | `forge.ts` | sink de material |
| Slots iniciais | 20 (legado 10) | schema | demanda de expansão |
| Taxa marketplace | 0% → **4%/5% [LAUNCH]** | contratos | burn+treasury |
| Preços de catálogo | 90–450+ (124 itens) | `itemCatalog.ts` | força de todos os sinks % |

---

*Mantido em `docs/07-economy/`. Números divergentes do código = bug de documentação; corrigir citando commit.*
