# Dolrath — Whitepaper Econômico

**Versão 0.9 (draft interno) · Julho 2026 · PT-BR**

> Este documento descreve a economia do Dolrath: a arquitetura dual-token (DOL/GOLD), os mecanismos de emissão, queima e distribuição, o tesouro, a governança e o modelo anti-inflação. Tudo que está marcado **[AO VIVO]** existe em código hoje; o que está marcado **[LAUNCH]** é compromisso de design para o lançamento do token; **[ROADMAP]** vem depois. Números de gameplay citados aqui são medidos do código real do jogo — não estimativas de slide.

---

## Sumário

1. [Visão da economia](#1-visão-da-economia)
2. [Filosofia do projeto](#2-filosofia-do-projeto)
3. [Objetivos](#3-objetivos)
4. [Arquitetura dual-token](#4-arquitetura-dual-token)
5. [Fluxo completo do GOLD](#5-fluxo-completo-do-gold)
6. [Fluxo completo do DOL](#6-fluxo-completo-do-dol)
7. [Emissão](#7-emissão)
8. [Queimas](#8-queimas)
9. [Vesting e lockups](#9-vesting-e-lockups)
10. [Liquidez](#10-liquidez)
11. [Treasury](#11-treasury)
12. [Marketplace](#12-marketplace)
13. [NFT Economy](#13-nft-economy)
14. [Staking](#14-staking)
15. [DAO e Governança](#15-dao-e-governança)
16. [Modelo anti-inflação](#16-modelo-anti-inflação)
17. [Simulações de mercado](#17-simulações-de-mercado)
18. [Roadmap econômico](#18-roadmap-econômico)
19. [KPIs](#19-kpis)
20. [Riscos e mitigação](#20-riscos-e-mitigação)
21. [Disclaimer](#21-disclaimer)

---

## 1. Visão da economia

Dolrath é um MMORPG Web3 onde a economia foi desenhada na ordem certa: **primeiro o jogo, depois o token.** O loop de gameplay (masmorra → loot → craft → poder → masmorra mais funda) já roda em produção com moeda própria, sinks reais e emissão controlada por servidor — a tokenização é a camada de propriedade sobre uma economia que já funciona, não o motivo dela existir.

A tese econômica cabe em três frases:

1. **GOLD é trabalho.** Ganho jogando, gasto em tudo, com emissão gateada por stamina e teto diário por usuário. É a moeda circulante do mundo.
2. **DOL é mérito e participação.** Supply fixo, distribuído por conquistas raras, staking e governança — nunca por grind. É o ativo de longo prazo.
3. **Todo ponto de circulação de valor alimenta o sistema.** Taxas de marketplace e serviços dividem-se entre queima (beneficia quem segura) e tesouro (financia o jogo). A economia devolve valor a quem participa em vez de diluí-lo.

### Por que a maioria dos jogos Web3 quebrou — e o que fazemos diferente

| Erro clássico | Consequência | Resposta do Dolrath |
|---|---|---|
| Token único que é ao mesmo tempo recompensa de grind e reserva de valor | emissão infinita esmaga o preço | dual-token com papéis separados (GOLD/DOL) **[AO VIVO]** |
| Faucet client-side / hackeável | mint infinito, morte súbita | loot 100% servidor-autoritativo, claim assinado EIP-712, exploits conhecidos fechados antes do launch **[AO VIVO]** |
| Emissão sem teto "porque engajamento" | hiperinflação | teto diário de emissão por usuário (`DUNGEON_DAILY_GOLD_CAP`) **[AO VIVO]** |
| Land/NFT como impressora de dinheiro | pirâmide de renda passiva | NFTs dão propriedade e utilidade, nunca yield garantido **[LAUNCH]** |
| Receita = vender token | quando o hype acaba, o estúdio morre | receita de cosméticos, passes, taxas e serviços **[ROADMAP]** |
| Economia opaca, ajustes silenciosos | perda de confiança irreversível | relatório mensal público de emissão/burn; parâmetros migram para DAO **[LAUNCH]** |

## 2. Filosofia do projeto

Os cinco pilares (detalhados em [Vision](../01-vision/README.md)):

1. **Gameplay First** — divertido para quem nunca vende um token.
2. **Economia Circular** — praticamente todo GOLD ganho encontra motivo para ser gasto.
3. **DOL como ativo de longo prazo** — recompensas concentradas em conquistas relevantes.
4. **Receita sustentável** — o estúdio vive de serviços, não da valorização do token.
5. **Balanceamento orientado por dados** — emissão e queima monitoradas; ajustes graduais e públicos.

## 3. Objetivos

**Econômicos:**
- Manter razão sink/faucet de GOLD ≥ 0,7 em janelas de 7 dias.
- Fazer o supply circulante de DOL crescer mais devagar que a base de jogadores ativos a partir do ano 2 (pressão deflacionária por usuário).
- Tesouro com runway ≥ 18 meses em qualquer cenário simulado.

**De produto:**
- Onboarding sem carteira; conversão para carteira ≥ 25% por utilidade real.
- Marketplace tocado por ≥ 15% dos MAU.

**De confiança:**
- 100% da emissão e queima auditável on-chain ou em relatório mensal.
- Zero mudança econômica retroativa sobre saldos de jogadores.

## 4. Arquitetura dual-token

| | **GOLD** | **DOL** |
|---|---|---|
| Padrão | ERC-20 (Polygon) — `DolrathGold.sol` **[AO VIVO]** | ERC-20 (Polygon) — `DolToken.sol` v2 **[LAUNCH]** |
| Supply | elástico, gateado por gameplay | **fixo: 1.000.000.000** |
| Como nasce | jogando (masmorra, PvP, venda de itens) → claim assinado pelo servidor | TGE + epochs de conquista com decaimento |
| Papel | moeda de utilidade: loja, craft, reparo, taxas, mercado de itens | reserva de valor: mercado de personagens, staking, governança, coleções limitadas |
| Inflação | controlada por teto diário/usuário + sinks | zero emissão fora do schedule; queima líquida alvo no maduro |
| Analogia | o "ouro" de qualquer MMORPG | o "equity" do ecossistema |

A separação resolve o dilema central dos jogos Web3: recompensar milhões de ações de gameplay (GOLD, abundante e gastável) sem diluir o ativo de investimento (DOL, escasso e meritocrático).

**Correção pré-launch — IMPLEMENTADA (2026-07-01):** o `DolToken.sol` v2 já está no repositório: supply fixo de 1B cunhado uma única vez ao treasury, name "Dolrath" (DOL), **sem função de mint** (o `MINTER_ROLE` foi removido; o supply só pode diminuir via burn). Falta o redeploy (Amoy → mainnet) e os contratos de vesting por bucket (ver §9) **[LAUNCH]**.

## 5. Fluxo completo do GOLD

### 5.1 As três camadas **[AO VIVO]**

```
 GAMEPLAY                      CONTA                         BLOCKCHAIN
┌────────────────┐  depósito  ┌──────────────────┐  claim   ┌─────────────────┐
│ Carteira do    │──────────► │ Banco da conta   │────────► │ GOLD ERC-20     │
│ personagem     │ ◄──────────│ (User.goldBalance│  EIP-712 │ (DolrathGold)   │
│ (Character.gold)│   saque    │  = claimável)    │          │                 │
└────────────────┘            └──────────────────┘          └─────────────────┘
   ▲        │                                                  │          │
   │        ▼                                                  ▼          ▼
 FAUCETS  SINKS OFF-CHAIN                                МARKETPLACE   COMPRAS ON-CHAIN
 masmorra  loja, forja,                                  P2P (itens)   → TREASURY
 PvP       alquimia, expansão                            (taxa 4%)*    (+ taxa)*
 venda     de inventário                                 *[LAUNCH]
```

O GOLD nasce off-chain e enfrenta sinks **antes** de poder virar token: a loja aceita saldo off-chain, o craft cobra taxa off-chain, e só o que sobra no banco é reivindicável. Cada claim é um mint autorizado por assinatura EIP-712 do servidor (nonce único por destinatário, deadline, só o próprio destinatário executa).

### 5.2 Faucets (números do código)

| Faucet | Valor | Fonte |
|---|---|---|
| Masmorra — nó menor | 6–16 GOLD × dificuldade × tier | `dungeonAdventures.ts` |
| Masmorra — sala principal | 25–50 × d × tier | idem |
| Masmorra — **boss** | **150–300 × d × tier (até 3,4)** — domina o faucet | idem |
| Eventos de exploração | 15–100 GOLD/nível conforme masmorra | idem |
| PvP | 15 (vit.) / 8 (empate) / 5 (der.) × 1,08^nível × bônus 1,2–1,5 | `battle/rewards` |
| Venda de item ao jogo | 60% do preço de catálogo | `sell-item` |

**Faucet total medido por simulação:** ~4.900 GOLD/dia por personagem na Floresta (nv10) até ~10.900/dia nas Ruínas (nv50) — clampado pelo **teto diário de 20.000 GOLD/usuário** (env ajustável sem deploy, futura alavanca da DAO).

### 5.3 Sinks

Detalhe completo por sistema no [EDD](../07-economy/GAME-ECONOMY-DESIGN.md). Resumo: loja (90–450+ GOLD por item, 124 itens de catálogo), forja (taxa 30% do catálogo por craft; refino 10:1; reparo raro com Estilhaço), alquimia (30%, mín. 5), expansão de inventário, e **[LAUNCH]** taxas de marketplace e serviços premium. Medição real: uma run completa da Floresta com consumo de poções/reparos fecha em **-1.000 a -2.300 GOLD líquidos** — o jogador lucra progresso e materiais, não ouro livre.

### 5.4 Compromissos de launch para o GOLD

1. Taxa de marketplace de itens: **4%** (2% burn on-chain, 2% treasury).
2. Relatório mensal de emissão (soma de `Claimed`) vs queima.
3. Teto diário governável pela DAO na Fase B.

## 6. Fluxo completo do DOL

### 6.1 Usos (demanda)

| Uso | Mecânica | Status |
|---|---|---|
| Mercado de personagens | comprar/vender heróis NFT precificados em DOL (taxa 5%: 2,5% burn / 2,5% treasury) | contrato pronto e testado; deploy pendente **[LAUNCH]** |
| Staking | lock de DOL → participação nas taxas do protocolo + peso de voto | **[LAUNCH]** |
| Governança | veDOL (quantidade × duração do lock) | **[LAUNCH→ROADMAP]** |
| Passe de temporada premium | pago em DOL com 50% queimado (ou fiat) | **[ROADMAP]** |
| Coleções limitadas (lands, pets) | venda primária em DOL, parte queimada | **[ROADMAP]** |
| Serviços de vaidade | renomear herói, slots de personagem — parte queimada | **[ROADMAP]** |

### 6.2 Fontes (oferta para jogadores)

DOL chega ao jogador **apenas** pelo bucket *Play & Achieve* (30% do supply), via: topo de ranking PvP/PvE de temporada, first-kills e world bosses, torneios, e airdrops de reputação para veteranos. **Grind diário nunca paga DOL** — essa é a linha que separa Dolrath dos play-to-earn que colapsaram.

## 7. Emissão

### 7.1 GOLD

Emissão on-chain = claims voluntários dos jogadores sobre saldo já ganho e já "taxado" pelos sinks off-chain. Limite estrutural superior: `teto diário (20.000) × usuários ativos`; na prática a simulação aponta 25–40% disso (nem todo mundo joga até o teto, nem saca tudo).

### 7.2 DOL — schedule de 1.000.000.000 (supply fixo)

| Bucket | % | Tokens | Regra de liberação |
|---|---|---|---|
| **Play & Achieve** (jogadores) | 30% | 300M | epochs por temporada; orçamento anual = **25% do saldo restante do bucket** (decaimento perpétuo: ano 1 = 75M, ano 2 = 56M, ano 3 = 42M…) |
| **Treasury / DAO** | 20% | 200M | desbloqueio linear 48 meses; uso por governança |
| **Equipe** | 15% | 150M | cliff 12m, vesting linear 36m |
| **Investidores** | 12% | 120M | cliff 6m, vesting linear 24m |
| **Liquidez** | 10% | 100M | 25M no TGE (pools), restante conforme volume real |
| **Ecossistema/Parcerias** | 8% | 80M | caso a caso, lock mínimo 12m |
| **Comunidade/Airdrop** | 5% | 50M | campanhas de launch, veteranos do beta |

Circulante no TGE: ~4–6% do supply (liquidez inicial + primeira campanha comunitária) — float baixo deliberado, com desbloqueios lentos e públicos.

## 8. Queimas

| Mecanismo | Token | Taxa | Status |
|---|---|---|---|
| Taxa do mercado de itens | GOLD | 2% de cada venda queimado (`burnFrom`, destruição real) | contrato pronto; deploy **[LAUNCH]** |
| Taxa do mercado de personagens | DOL | 2,5% de cada venda queimado (`burnFrom`, destruição real) | contrato pronto; deploy **[LAUNCH]** |
| Passe premium pago em DOL | DOL | 50% do preço | **[ROADMAP]** |
| Venda primária de coleções (lands/pets) | DOL | ≥ 30% do arrecadado | **[ROADMAP]** |
| Serviços de vaidade | DOL/GOLD | 100% do custo (é sumidouro puro) | **[ROADMAP]** |
| Buyback-and-burn com receita fiat | DOL | decisão trimestral da DAO | **[ROADMAP]** |

Meta de maturidade (ano 3+): queima anual de DOL ≥ emissão anual do bucket Play & Achieve → **supply circulante líquido estável ou decrescente** enquanto o jogo cresce. GOLD: queima on-chain + sinks off-chain mantêm sink/faucet ≥ 0,7.

Ambos os contratos já herdam capacidade de burn (`ERC20Burnable` no DOL; GOLD queima via sinks pré-claim por design).

## 9. Vesting e lockups

Regras duras, em contrato de vesting on-chain (não planilha):

- **Equipe:** cliff 12 meses + 36 meses lineares. Ninguém do time consegue vender no hype do launch.
- **Investidores:** cliff 6 meses + 24 meses lineares; sem desconto que gere dump imediato (preço de rodada público no TGE).
- **Treasury:** 48 meses lineares; gasto só por proposta aprovada (multisig → DAO).
- **Liquidez:** LP tokens do par inicial travados por 24 meses (prova pública de não-rug).
- **Transparência:** endereços de vesting publicados; dashboard mostra o cronograma de desbloqueio ao vivo (ver [Tokenomics](../22-tokenomics/README.md)).

## 10. Liquidez

- **Par inicial:** DOL/USDC (ou DOL/POL) em DEX na Polygon, semeado com os 25M do bucket + contrapartida do caixa. Alvo: profundidade que absorva a venda diária média projetada de recompensas sem mover o preço > 2%.
- **GOLD:** liquidez de GOLD **não é prioridade nem promessa** — GOLD vale pelo que compra dentro do jogo. Um par pequeno GOLD/DOL pode existir para arbitragem natural, mas o jogo não o subsidia (aprendizado dos duais que quebraram: subsidiar o preço da moeda de grind é enxugar gelo).
- **Crescimento:** aportes adicionais de liquidez seguem volume real (regra: TVL do par ≥ 5× volume diário médio), decididos publicamente.
- **Sem market-making opaco:** qualquer acordo de MM terá termos públicos (prática de confiança acima da média do setor).

## 11. Treasury

**Entradas:** 2%/2,5% das taxas de marketplace (GOLD/DOL), GOLD gasto em compras on-chain (`GOLD_TREASURY_ADDRESS` **[AO VIVO]**), venda primária de coleções, receita fiat de passes/cosméticos, bucket DOL de 200M.

**Saídas (política):**

| Categoria | Alvo |
|---|---|
| Desenvolvimento e infraestrutura | ≤ 50% |
| Premiações (torneios, world boss, seasons) | 20–30% |
| Liquidez e estabilidade | ≤ 15% |
| Buyback-and-burn | decisão trimestral |
| Grants/comunidade | 5–10% |

**Governança do tesouro:** multisig 3/5 no launch com relatório mensal; migração progressiva para DAO (§15). Runway mínimo de 18 meses é restrição de qualquer proposta de gasto.

## 12. Marketplace

Estado e desenho detalhados em [Marketplace](../11-marketplace/README.md). Papel econômico:

1. **É o coração da circulação** — o valor criado por jogadores (loot, craft, +N de aprimoramento congelado no NFT) troca de mãos em GOLD (itens) e DOL (personagens).
2. **É o principal ponto de captura de valor** — as taxas (4%/5%) são a fonte recorrente de burn + treasury. Hoje os contratos cobram 0%; a taxa entra **antes do deploy mainnet**, porque adicionar taxa depois é quebra de contrato social.
3. **É anti-RMT** — mercado oficial líquido e barato mata o mercado negro que assola MMORPGs.

Evoluções: leilões (lendários), ofertas, aluguel de NFT (§13), histórico de preços indexado.

## 13. NFT Economy

Princípio: **NFT é propriedade, não paywall** (ver [NFT System](../08-nft-system/README.md)).

- **Personagens** — ERC-721 com **metadata viva** (XP/nível atualizam no NFT). Vendáveis por DOL. O tempo investido vira ativo transferível — com taxa que recicla valor (burn+treasury).
- **Itens** — ERC-721 **lazy-mint**: só vira NFT (pagando gas) o item que o dono decide listar; o `+N` de aprimoramento é congelado no mint. Zero custo de chain para os 99% dos itens que vivem e morrem no gameplay.
- **Aluguel [ROADMAP]** — dono lista personagem/item; locatário joga; split automático do GOLD ganho (ex.: 70/30) imposto por contrato — scholarship sem intermediário e sem custódia.
- **Coleções limitadas [ROADMAP]** — lands e pets vendidos em DOL em ondas gateadas por MAU; produção deles é **material de craft, nunca token** (anti-pirâmide).
- **Conquistas soulbound [ROADMAP]** — reputação não-transferível; base para airdrops meritocráticos.

## 14. Staking

**[LAUNCH]** Single-sided staking de DOL com locks de 3/6/12/24 meses:

- **Recompensas:** (a) sub-alocação do bucket Play & Achieve dedicada a staking (20% de cada epoch); (b) distribuição trimestral de 50% das taxas acumuladas no treasury, aprovada por governança. **Sem APY fixo prometido** — yield real, variável com o volume do jogo.
- **veDOL:** peso de voto = quantidade × duração restante do lock. Quem trava mais tempo governa mais.
- **Utilidade in-game do stake [ROADMAP]:** cosméticos exclusivos e prioridade em eventos por tier de stake (nunca poder de combate).
- **Alvo de participação:** 30–40% do circulante em stake (reduz float, alinha horizonte).

## 15. DAO e Governança

Desenho completo em [DAO](../12-dao/README.md). Síntese: a DAO governa **parâmetros econômicos** (teto de emissão, taxas, splits, uso do treasury, calendário de epochs) — nunca game design. Progressão em 3 fases: multisig com veto comunitário (T+6m) → propostas comunitárias com quórum (T+12m) → execução on-chain com timelock 48h (T+24m). Voto por veDOL.

## 16. Modelo anti-inflação

A defesa é em camadas — cada uma já falhou sozinha em outros jogos; juntas se cobrem:

1. **Separação de papéis (estrutural):** o token de investimento (DOL) não é emitido por gameplay repetível. A inflação de gameplay fica contida no GOLD, que tem preço interno (utilidade), não promessa de preço externo.
2. **Gates físicos [AO VIVO]:** stamina limita sessões; teto diário limita emissão por usuário; multi-conta limitada por carteira e custo de progressão.
3. **Sinks antes do claim [AO VIVO]:** a arquitetura em camadas força o GOLD a passar pela "alfândega" de sinks off-chain antes de existir on-chain.
4. **Sinks proporcionais [AO VIVO]:** taxas de craft são % do catálogo — sobem automaticamente com o poder de compra do jogador, sem retrabalho de LiveOps.
5. **Queima acoplada ao volume [LAUNCH]:** burn de marketplace cresce exatamente quando a atividade (e a emissão) cresce — estabilizador automático.
6. **Decaimento de emissão do DOL:** 25% do saldo restante/ano — matematicamente incapaz de estourar o supply, com cauda longa para sempre haver orçamento de temporada.
7. **Monitoramento e alavancas [AO VIVO]:** sink/faucet ratio como métrica-guia; cap por env sem deploy; playbook de incidente ([LiveOps](../31-liveops/README.md)).
8. **Transparência como âncora:** relatório mensal público — inflação anunciada não vira pânico; inflação escondida vira êxodo.

## 17. Simulações de mercado

Modelo completo, premissas e planilha de 120 meses: [Tokenomics](../22-tokenomics/README.md) (script determinístico `scripts/token-economy-sim.js` — auditável e re-rodável).

Três cenários (base/otimista/pessimista) variando crescimento de jogadores, claim rate e volume de marketplace. Conclusões estruturais (válidas nos três):

1. **O circulante de DOL desacelera todo ano** (decaimento do bucket + vesting terminando), enquanto a queima cresce com o volume. No cenário otimista o supply circulante vira **líquido decrescente a partir do ano ~5** (ano 5: 890M → ano 10: 842M); no base ele quase estabiliza (+0,4%/ano no fim da década); no pessimista segue crescendo lentamente — o que reforça a necessidade das queimas adicionais do roadmap (passes, coleções, buyback) para atingir a meta de queima ≥ emissão do §8.
2. **A emissão on-chain de GOLD é limitada superiormente pelo produto `cap × usuários`** — não existe cauda de risco de hiperinflação por bug de gameplay (o pior caso é o teto).
3. **O treasury se torna autossustentável** quando o volume mensal de marketplace ultrapassa ~10× o custo de infraestrutura — antes disso, o runway vem do TGE (por isso 18 meses de reserva mínima).
4. **Sensibilidade dominante:** retenção D30. A economia sobrevive a preço de token baixo; não sobrevive a jogo ruim. (Por isso o pilar 1 é gameplay.)

## 18. Roadmap econômico

| Etapa | Entregas econômicas | Critério de saída |
|---|---|---|
| **E0 — Hardening** (agora) | playtest claim; taxa nos contratos; DolToken v2; auditoria | zero exploit crítico; sink/faucet ≥ 0,7 por 4 semanas |
| **E1 — TGE** | liquidez inicial; vesting on-chain; staking v1; dashboard público | profundidade de liquidez alvo; float ≤ 6% |
| **E2 — Circulação** | mercado de personagens (DOL); leilões; relatórios mensais | ≥ 15% MAU no marketplace |
| **E3 — Ritmo** | seasons com epochs de DOL; passe; PvP ranqueado | orçamento de epoch cumprido sem estouro |
| **E4 — Expansão** | aluguel de NFT; lands/pets (ondas gateadas); DAO Fase B | produção de land sem impacto no sink/faucet |
| **E5 — Maturidade** | DAO Fase C; queima ≥ emissão de DOL; buybacks | supply líquido estável/decrescente |

## 19. KPIs

Painel completo em [Analytics](../32-analytics/README.md). Os seis que definem sucesso ou fracasso:

| KPI | Meta | Por quê |
|---|---|---|
| Sink/Faucet GOLD (7d) | ≥ 0,7 | inflação de utilidade sob controle |
| Claim rate | 20–40% | jogadores usam o jogo, não só a torneira |
| Burn/Emissão de DOL (anual) | → ≥ 1,0 no ano 3 | escassez real crescente |
| Treasury runway | ≥ 18 meses | sobrevivência independe de bull market |
| Retenção D30 | ≥ 10% | a variável da qual tudo depende |
| % MAU no marketplace | ≥ 15% | a economia circular existe de fato |

## 20. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Exploit de emissão | servidor-autoritativo + teto diário (pior caso limitado) + playbook de incidente + auditoria externa |
| Death spiral do token | receita fiat independente; GOLD não precisa de preço externo; runway 18m |
| Concentração (baleias) | float baixo mas vesting longo p/ insiders; veDOL premia tempo, não só volume |
| Regulatório | DOL desenhado como utility (uso in-game real); revisão jurídica por jurisdição antes do TGE; sem promessa de yield fixo |
| Dependência de terceiros (Polygon, Vercel, IA) | contratos padrão OpenZeppelin portáveis; infra substituível; arte/juiz IA com fallbacks |
| Multi-conta / sybil no faucet | economia por usuário+carteira; custo de progressão por personagem; análise on-chain de clusters |

## 21. Disclaimer

Este documento descreve mecânicas de software em desenvolvimento e não constitui oferta de valores mobiliários, promessa de retorno financeiro ou aconselhamento de investimento. Tokens DOL e GOLD são utilitários do ecossistema Dolrath; seu valor pode ser zero. Números de simulação são cenários ilustrativos re-executáveis, não projeções garantidas. Parâmetros podem mudar antes do launch — sempre com registro público neste repositório.

---

*Mantido em `docs/21-whitepaper/`. Alterações via commit — o histórico do git é o changelog oficial da economia.*
