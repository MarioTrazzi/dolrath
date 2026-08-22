# Benchmark — Obelisk Hero ($HERO)

> **Coleta: 2026-08-22.** Concorrente direto: idle RPG de masmorra, token-gated, na
> Solana. Este documento existe para separar duas coisas que costumam vir juntas —
> **o desenho econômico deles, que é bom e vale copiar em partes**, e **o resultado de
> mercado deles, que não existe**. Os números de mercado envelhecem rápido; os do motor
> econômico foram extraídos do código do cliente e estão atribuídos à fonte.

## Fontes

| O quê | Onde |
|---|---|
| Jogo | <https://obeliskhero.xyz/game.html> |
| Whitepaper v2.0 (julho/2026) | <https://obeliskhero.xyz/whitepaper.html> — §14 Token, §16 Tokenomics, §17 Fees, §20 Sustainability |
| Curva de recompensa (espelho do servidor) | <https://obeliskhero.xyz/js/hero_economy.js> |
| Constantes de economia (`CONFIG`) | <https://obeliskhero.xyz/js/data.js> |
| Config viva do servidor | <https://obeliskhero.xyz/api/config/public> |
| Mercado | Dexscreener / GeckoTerminal |

Como reconferir:

```bash
curl -s "https://api.dexscreener.com/latest/dex/tokens/3C2NVwF1TitXe1AhrBkRt2n2rhEnN6Ah1hKAJ3eMpump" \
  | python3 -c "import json,sys; p=json.load(sys.stdin)['pairs'][0]; print(p['priceUsd'], p['marketCap'], p['volume']['h24'])"
curl -s "https://obeliskhero.xyz/api/config/public"
```

---

## 1. Identidade do token

| Campo | Valor |
|---|---|
| Token | HERO — Solana, **Token-2022** (`TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`) |
| Mint vivo | `3C2NVwF1TitXe1AhrBkRt2n2rhEnN6Ah1hKAJ3eMpump` |
| Lançamento | **pump.fun, 2026-08-02** |
| Supply | 1.000.000.000 fixo · 6 casas · sem mint adicional |
| Distribuição | **sem alocação pré-lançamento.** Lançou 100% no pump.fun, sem seed nem preço de rodada. Os "buckets" do §16.2 do whitepaper são política de tesouraria sobre HERO *comprado no mercado depois*, e o próprio documento diz isso com todas as letras |
| Acesso ao jogo | ≥ **1.000 HERO** na carteira ("holder mode"); o beta joga sem carteira |
| NFT | **nenhum** — heróis e itens não são NFT; o marketplace do beta é local |

### 1.1 O jogo já teve outro token

O `js/data.js` ainda traz hardcoded, como fallback, o mint `8oosbx7jJrZxm5m4ThKhBpvwwG4QpoAe6i4GiG19pump`
— que é **"Wizard Gang"**, um memecoin de abril/2025 com mcap de ~US$ 103k. O jogo nasceu
como camada token-gated da comunidade daquele memecoin (daí a expressão "guild mint" no
site) e depois relançou com token próprio. **O $HERO é o segundo token do mesmo produto.**

Registrar isto importa porque é o tipo de coisa que não aparece no whitepaper e que muda
completamente a leitura de "projeto novo com token novo".

---

## 2. A realidade do mercado (leitura honesta)

Medido em 2026-08-22:

| Métrica | Valor |
|---|---|
| Market cap / FDV | **~US$ 29.800** |
| Preço | ~US$ 0,0000298 |
| Volume 24h | **~US$ 2.776** |
| Transações 24h | 52 compras / 51 vendas |
| Carteiras distintas 24h | ~7 compradores / ~6 vendedores |

**Os "30k" são market cap, não valorização.** É uma moeda de pump.fun com três semanas de
vida, volume diário de menos de três mil dólares e cerca de uma dúzia de carteiras ativas
por dia. Não há hype mensurável — há um jogo bem feito com um token minúsculo.

> **Regra de uso deste documento:** copiar mecanismo, nunca narrativa de sucesso. Nada
> aqui é evidência de que o modelo deles funciona; é evidência de que ele foi *pensado*.

---

## 3. O motor econômico

Fonte primária: `js/hero_economy.js` (declarado como espelho de
`server-ts/src/game/heroEconomy.ts`, com o comentário "That file is the authority") e o
bloco `CONFIG` de `js/data.js`. São os números que o servidor paga, não os do slide.

### 3.1 A decisão estrutural: um token só

HERO é ao mesmo tempo o ativo escasso **e** a moeda que o jogador saca. O **Gold não é
token** — é moeda interna, deliberadamente fora da blockchain. A justificativa está no
§14 do whitepaper deles:

> "Obelisk Hero avoids a dual-token reward model. HERO is the ecosystem utility asset,
> while Gold remains a non-token in-game currency. This separation keeps routine balance
> changes away from the external token and avoids creating a second speculative asset."

É a decisão oposta à nossa em um eixo (nós temos dois tokens) e igual à nossa no outro
(a moeda de balance rotineiro fica isolada). Ver §5.8 para a consequência.

### 3.2 Faucet — o que entra no bolso do jogador

**Andar normal** — curva `FLOOR_BASE`, HERO médio por clear:

| Andar | 1 | 10 | 20 | 40 | 60 | 80 | 100 |
|---|---|---|---|---|---|---|---|
| HERO | 3,0 | 5,6 | 9,0 | 18,0 | 36,0 | 72,0 | 150,0 |

- RNG por clear: **×0,85 a ×1,15**.
- Bônus de Mimic: `min(mimics × 0,20 ; 0,40)` — o **terceiro mimic não adiciona nada**.
  (Elegante: cria a caçada sem criar farm de mimic.)

**Chefe** (a cada 10 andares) — base garantida para o andar inteiro, nunca por baú:

| Andar | 10 | 20 | 30 | 40 | 50 | 60 | 70 | 80 | 90 | 100 |
|---|---|---|---|---|---|---|---|---|---|---|
| HERO base | 650 | 1.200 | 2.000 | 3.200 | 5.000 | 7.500 | 10.500 | 15.000 | 22.000 | 32.500 |

…multiplicada por uma **tabela de jackpot** rolada no servidor:

| Tier | Chance | Multiplicador |
|---|---|---|
| NORMAL | 60,0% | ×1,0 |
| GREAT | 25,0% | ×1,5 |
| JACKPOT | 10,0% | ×2,5 |
| SUPER | 4,0% | ×5,0 |
| ULTRA | 0,9% | ×10,0 |
| **MEGA** | **0,1%** | **×25,0** |

**EV = 1,54×.** O custo de balance é conhecido e o efeito de retenção é gratuito.

**Multiplicadores sobre tudo:** tier de stake (1,00 → 1,50×) e raridade **média** do
grupo (`PARTY_RARITY_REWARD_MULT`, teto 1,10× — o código anota explicitamente "MEAN […],
capped at 1.10. Never a product").

**Detalhe de apresentação que vale roubar:** `splitAcrossChests()` reparte um total já
decidido entre os baús com pesos aleatórios que **somam exatamente o total**. O número de
baús do andar não pode alterar quanto o andar paga — a variância é cenografia.

### 3.3 Sinks — o que sai

| Sink | Valor |
|---|---|
| Character Box | **150.000 HERO** ao vivo (`/api/config/public`); o `data.js` diz 30.000 — o servidor manda |
| Animal Box | 150.000 HERO |
| Pacote de equipamento raro (1× por classe) | 90.000 HERO |
| **Loja de Gold** | **1 HERO = 20 Gold**, mínimo 1 HERO, **sem limite diário** — sink puro |
| Taxa de marketplace | **3–5%**, menor conforme o stake |
| Taxa de saque | **5%** *por cima* do pedido (pede 100 → reserva 105) · mínimo 100 HERO · cooldown 6h |
| Forge +7 a +10 | pode **destruir** o equipamento |
| Sair de andar não terminado | **destrói o loot pendente** |

**Hard cap de oferta do ativo primário:** `BOX_SUPPLY = 1000` character boxes que podem
ser abertas *para sempre*, e `ANIMAL_BOX_SUPPLY = 1500`. A escassez não está só no token
— está no herói.

**Split da taxa de marketplace** (§17.1, política de tesouraria, não roteamento on-chain):
40% tesouro · 30% recompra · **20% queima** · 10% marketing.
**Split da taxa de saque** (§17.2): 50% tesouro · 30% recompra · 20% queima.

### 3.4 Governo da emissão — a melhor parte

| Constante (`js/data.js`) | Valor | Papel |
|---|---|---|
| `HUB_REWARD_POOL_INITIAL` | 60.000.000 HERO | pool fechada de recompensas |
| `HUB_DAILY_REWARD_BUDGET` | 900.000 HERO/dia | teto **global**, não por conta |
| `HUB_RESERVE_FLOOR` | 5.000.000 HERO | piso: abaixo disso o faucet fecha |
| `HUB_DYNAMIC_REWARDS` | `true` | liga o freio automático |
| `HUB_REWARD_SMOOTHING_MIN/MAX` | 0,25 → 1,00 | a recompensa **encolhe até 4× sozinha** conforme a saúde da reserva |
| `BOX_ECOSYSTEM_FEE_PCT` | 10% | a única parte da venda que vira receita |
| `BOX_REWARD_POOL_RECYCLE_PCT` | **90%** | **o HERO gasto em box volta para a pool de recompensas** |
| `HUB_TREASURY_INITIAL` | 300.000.000 | cenário de planejamento (~30% adquirido) |

O comentário do código é explícito sobre o teto: `HUB_PER_ACCOUNT_DAILY_CAP` existe como
"legacy/emergency reference only; dungeon payouts do NOT use a per-team hard cap". **Eles
abandonaram o teto por conta e ficaram com o freio agregado.** É o inverso do nosso.

### 3.5 O fecho aritmético do ROI

```js
HUB_REFERENCE_MARKET_CAP_USD = 100_000   // mcap de referência do modelo
HERO_REFERENCE_COST_USD      = 3         // custo alvo de um herói, em dólar
TARGET_ROI_DAYS              = 40        // payback alvo
HUB_PER_HERO_DAILY_TARGET    = 750       // = 30.000 HERO ÷ 40 dias
```

Declarando mcap de referência, preço do ativo primário em dólar e tempo de payback, eles
**derivam** quanto uma masmorra pode pagar por dia. "Quanto o andar 37 deve pagar?" vira
conta, não opinião — e qualquer mudança de curva pode ser checada contra o alvo.

O corolário operacional: **o preço da box é um dial de servidor.** Está 30.000 no código e
150.000 ao vivo, reajustado conforme o preço do token caiu, para manter o custo em dólar
na faixa. O sink é cobrado em token; o alvo é em dólar.

### 3.6 Stake tiers — por saldo depositado, não pela carteira

`CONFIG.HOLDER_TIERS`. Os perks valem pelo **HERO depositado dentro do jogo** e não
sacado — não pela carteira, e não por contrato de lockup.

| Tier | HERO depositado | Reward | Taxa mkt | Farm offline | Cap offline | Velocidade |
|---|---|---|---|---|---|---|
| Visitor | 0 | 1,00× | 5% | 30% | 8h | 1× |
| Initiate | 500.000 | 1,00× | 5% | 40% | 12h | 2× |
| Vanguard | 1.000.000 | 1,15× | 5% | 55% | 16h | 2× |
| Elite | 5.000.000 | 1,30× | 4% | 75% | 20h | 4× |
| Obelisk | 10.000.000 | 1,50× | 3% | 100% | 24h | 4× |

Tira float do mercado sem prometer rendimento e sem cheirar a security — é custódia
reversível, não staking. O `rewardMult` até 1,50×, porém, é pay-to-earn-more (ver §5.7).

---

## 4. Comparação com o Dolrath

| Eixo | Obelisk Hero | Dolrath (hoje) |
|---|---|---|
| Tokens | **1** (HERO) + Gold interno não-token | **2** (DOL escasso + GOLD reivindicável on-chain) |
| O que o jogador saca | o token escasso | GOLD (a moeda de grind) |
| Governo do faucet | pool fechada + teto **global**/dia + piso de reserva + smoothing automático | teto **por usuário** (`DUNGEON_DAILY_GOLD_CAP` = 20.000/dia) + stamina |
| Receita primária | 10% taxa / **90% recicla** na pool de recompensas | 2 USDC → 100% tesouro, não recicla |
| Ancoragem de preço | sink em token, dial de servidor mirando USD | criação em USDC (bom); inscrição fixa em **100 DOL** (não ajustável) |
| ROI declarado | mcap ref + custo USD + payback 40d ⇒ pagamento/dia | não declarado |
| Taxa de saída | saque 5% + mínimo 100 + cooldown 6h | claim de GOLD **grátis** |
| Variância no chefe | tabela de jackpot, EV 1,54×, até ×25 | d20 só no espólio |
| Sair da run | destrói o loot pendente | estorna o passo (sem penalidade, por design) |
| Ativo primário | **1.000 boxes para sempre** | criação de personagem ilimitada |
| NFT | nenhum | personagem e item são NFT |
| Staking | tiers por saldo depositado, perks de gameplay | §14 do whitepaper, ainda `[LAUNCH]` |

---

## 5. Recomendações

Ordenadas por retorno sobre custo. Cada uma vira um plano próprio; nada disto é código
ainda.

### 5.1 ADOTAR — reciclar a receita primária no bucket de recompensas

Hoje nosso faucet de DOL sai só do bucket Play & Achieve (25%/ano do saldo restante) e o
DOL gasto pelos jogadores morre no tesouro. Se uma fatia do que eles gastam — inscrição
avulsa de temporada, taxa do mercado de personagens, passes — **voltar ao bucket**, o
faucet passa a ser financiado pelo próprio sink e a emissão nova cai ano a ano. É a
diferença entre uma pool que drena e uma que respira.

### 5.2 ADOTAR — piso de reserva e smoothing dinâmico

Nosso teto é por usuário: 10× jogadores = 10× emissão, sem freio. Falta o mecanismo
agregado deles — teto global diário, piso de reserva e um multiplicador global 0,25–1,00
movido pela saúde da reserva. Implementação barata (um multiplicador na rota de crédito) e
é exatamente o freio que faltou nos P2E que quebraram.

### 5.3 ADOTAR — declarar a aritmética do ROI

Escrever no whitepaper as quatro constantes equivalentes: mcap de referência do modelo,
custo do personagem em USD (já temos, 2 USDC), payback alvo em dias — e **derivar** daí o
teto diário por personagem. Hoje o 20.000/dia é um número escolhido; vira consequência de
uma tese pública e auditável.

### 5.4 ADOTAR — preços em DOL como dial de servidor com banda em USD

A inscrição de 100 DOL fixos fica proibitiva se o DOL subir 10× e gratuita se cair. Mesma
solução deles: valor em DOL configurável no servidor, alvo declarado em dólar, mudanças
publicadas.

### 5.5 ADOTAR — taxa no claim de GOLD

O `claimWithSig` é o ponto exato onde valor sai do jogo e hoje é de graça. Uma taxa (parte
queima, parte tesouro) + valor mínimo + cooldown é o sink mais barato que existe, e mata
claim-spam de bot de uma vez.

### 5.6 ADOTAR — tabela de jackpot no chefe

EV neutro, custo de implementação quase zero, e é o que faz o jogador querer mais uma run.
Entra no crédito do nó de chefe (`docs/…` / recompensas em lote por nó). O 0,1% de ×25 é o
que vira post no Discord.

### 5.7 DISCUTIR — tiers por DOL depositado

O mecanismo é bom: tira float sem lockup e o `User.goldBalance` já é uma custódia. Mas o
`rewardMult` de até 1,50× é **pay-to-earn-more** — concentra emissão em quem já tem, que é
como o Axie acabou. Se adotarmos, a recomendação é dar perks de *conveniência* (cap de farm
offline, taxa de mercado menor, velocidade de run) e **não** multiplicador de recompensa.

### 5.8 NÃO ADOTAR o token único — mas levar a sério o corolário

Nossa separação DOL/GOLD já está em produção, e o modelo deles tem o custo oposto: o token
escasso é emitido por grind, o que coloca pressão de venda direta no preço. Não há motivo
para inverter.

**Mas o corolário deles merece um ADR:** eles não deixam a moeda de grind virar ativo de
mercado. Nosso GOLD *é* reivindicável on-chain, e nosso próprio simulador projeta **17,8
bilhões de GOLD on-chain em 10 anos** (`docs/22-tokenomics/README.md`). Se o GOLD ficasse
100% interno, os sinks off-chain fariam todo o trabalho e nada precisaria de preço externo.
A pergunta a responder antes do TGE: **o que exatamente o claim on-chain de GOLD compra
para nós que o mercado de itens em DOL não compraria?**

### 5.9 NÃO ADOTAR — destruir o loot pendente ao sair da run

Contradiz nosso princípio de progressão sem penalidade, e o estorno síncrono já está
commitado. É sink deles, é UX nossa — registrar a diferença e seguir.

---

## 6. Coisas menores que valem nota

- **Beta sem carteira.** O jogo inteiro é jogável sem conectar nada, salvando em
  `localStorage`. O funil é "entenda o jogo antes de entender a carteira" — princípio 06
  do whitepaper deles.
- **`splitAcrossChests`.** Variância visual que não altera o total pago (§3.2).
- **Starter pack gateado por social.** Verificação de OAuth do X + participação no Discord,
  com backend próprio (`/api/starter`), e o documento é explícito que engajamento no X é
  opcional e nunca trocado pelo pack.
- **Cupom de influenciador**, aplicável uma vez, desconto em 6-pack.
- **Honestidade documental.** O §16.2 diz que os percentuais são política proposta e "not a
  claim that this exact distribution was embedded into the pump.fun launch"; o §26 lista
  risco de reset de beta. É um padrão de comunicação melhor que a média do setor e vale
  como referência de tom para o nosso `/doc`.
