# Ensaio v2 — Amoy, 1 semana antes da mainnet

Ensaio completo da **Fase 1** (ver `LAUNCH-MAINNET.md`) na Polygon Amoy, rodando
por uma semana com jogadores de verdade antes de tocar na mainnet.

**O que este ensaio existe para provar** — em ordem de risco:

1. **O caminho de 6 decimais.** `payDol.ts` e `dolPayments.ts` leem `decimals()`
   do contrato em runtime, mas isso nunca foi exercitado contra nada que não
   fosse 18 casas. Se 2 USDC virarem `2000000` ou `0.000002` em algum ponto, é
   aqui que se descobre — não com dinheiro real.
2. **A contabilidade da pool.** Cada personagem criado tem que somar exatamente
   100 em `PvpSeason.fundedDol` e gravar `paidUsdc = 2` no ledger. Duas moedas,
   duas colunas, nenhuma se misturando.
3. **O fechamento da temporada** ponta a ponta: snapshot do top 20, carteiras
   corretas, cofre de torneios recebendo a sobra.
4. **O resto do loop on-chain** que já existia: claim de GOLD, mint de item,
   mercado de itens.

Nada de DOL aqui: na Fase 1 ele é saldo contábil. `DolToken`, `DolDistributor` e
o mercado de personagens só entram na Fase 2.

---

## 1. Pré-requisitos

- [ ] POL de teste no deployer — faucet oficial da Polygon (`faucet.polygon.technology`, rede Amoy)
- [ ] `web3/.env` com `POLYGON_AMOY_RPC_URL`, `DEPLOYER_PRIVATE_KEY` e os três signers
      (`GOLD_SIGNER_ADDRESS`, `NFT_SIGNER_ADDRESS`, `ITEM_NFT_SIGNER_ADDRESS`)
- [ ] Um ambiente do app apontando para a Amoy (Preview da Vercel ou local),
      **separado da produção** e com banco separado
- [ ] `npm run chain:test` verde (45 casos)

> As chaves do ensaio são descartáveis e **nunca** podem ser reaproveitadas na
> mainnet.

## 2. Deploy na Amoy

```
npm run chain:deploy:usdc:amoy        # TestUSDC — dublê de 6 decimais + faucet
#   → USDC_TOKEN_ADDRESS=0x...   (vai em DOL_TOKEN_ADDRESS, ver §3)

npm run chain:deploy:gold:amoy        # DolrathGold
npm run chain:deploy:characters:amoy  # DolrathCharacters
npm run chain:deploy:items:amoy       # DolrathItems
npm run chain:baseuri:amoy            # baseURI de metadata dos itens
npm run chain:deploy:market:amoy      # DolrathItemMarket (GOLD, fee 4%)
```

`TestUSDC` (`web3/contracts/mocks/TestUSDC.sol`) existe só para o ensaio e se
recusa a rodar na rede `polygon`. Na mainnet o token de pagamento é a USDC
nativa da Circle, que já existe e não se deploya.

Carga manual para contas do estúdio e bots da frota (o faucet público resolve
para os testadores):

```
USDC_TOKEN_ADDRESS=0x... USDC_MINT_TO=0xA,0xB USDC_MINT_AMOUNT=500 \
  npm run chain:mint:usdc:amoy
```

## 3. Envs do ambiente de ensaio

```
NEXT_PUBLIC_CHAIN_ID="80002"
GOLD_CHAIN_ID="80002"   # e todos os outros *_CHAIN_ID

# ⚠️ DOL_TOKEN_ADDRESS guarda o token de PAGAMENTO (ver .env.example).
#    No ensaio é o TestUSDC; na mainnet será a USDC da Circle.
DOL_TOKEN_ADDRESS="0x<TestUSDC>"
NEXT_PUBLIC_DOL_TOKEN_ADDRESS="0x<TestUSDC>"
DOL_TREASURY_ADDRESS="0x<carteira de teste do estúdio>"
NEXT_PUBLIC_DOL_TREASURY_ADDRESS="0x<mesma>"
CHARACTER_CREATION_COST_DOL="2"
NEXT_PUBLIC_CHARACTER_CREATION_COST_DOL="2"

SEASON_ENTRY_DOL="100"
SEASON_ENTRY_ENABLED="false"      # inscrição avulsa é Fase 2

# Temporada curta SÓ no ensaio — para caber o fechamento dentro da semana.
PVP_SEASON_DAYS="5"
PVP_OFFSEASON_DAYS="1"
PVP_PAYOUT_MIN_MATCHES="3"        # o piso de 10 não fecha em 5 dias

ADMIN_USER_IDS="<seu userId>"     # libera /admin/season
BATTLE_REWARDS_SECRET="..."       # sem ele o PvP não credita (fail-closed)
CRON_SECRET="..."
```

> `PVP_SEASON_DAYS=5` e `PVP_PAYOUT_MIN_MATCHES=3` são **exclusivos do ensaio**.
> Na mainnet voltam para 90/120 e 10 — anote isso na virada, é o tipo de env que
> vaza de um ambiente para o outro.

## 4. Como o testador entra

1. Instalar MetaMask e trocar para **Polygon Amoy** (o app oferece a troca sozinho).
2. POL de gas: faucet oficial da Polygon.
3. tUSDC: chamar `faucet()` no contrato pelo Polygonscan da Amoy
   (*Write Contract* → `faucet`). Entrega 50 tUSDC a cada 12h — dá para 25 heróis.
4. Entrar no app, logar por carteira, criar o herói pagando 2 tUSDC.

## 5. O que conferir NO PRIMEIRO herói criado

Este é o portão. Se algo aqui estiver errado, para o ensaio e conserta.

- [ ] No Polygonscan: saíram **2,00** tUSDC da carteira do jogador — não
      2.000.000, não 0,000002 — e entraram no `DOL_TREASURY_ADDRESS`
- [ ] `DolPrizeContribution`: `paidUsdc = 2`, `paidDol = 100`, `prizeDol = 100`,
      `opsDol = 0`
- [ ] `PvpSeason.fundedDol` subiu **exatamente 100**
- [ ] `PvpSeasonEntry` criada com `source = 'creation'`
- [ ] `/ranking` mostra o pote em DOL e o rodapé "criar um herói já o inscreve"
      (inscrição avulsa fechada)
- [ ] NFT do herói cunhada e visível na carteira

```sql
-- atalho de conferência
SELECT "paidUsdc", "paidDol", "prizeDol", "opsDol", kind
  FROM "DolPrizeContribution" ORDER BY "createdAt" DESC LIMIT 5;
SELECT name, "fundedDol", "potDol" FROM "PvpSeason" ORDER BY "startsAt" DESC LIMIT 2;
```

## 6. Roteiro da semana

| Dia | O que exercitar |
|---|---|
| 1 | Criação de heróis (§5 em cada um dos primeiros). Loop de masmorra. |
| 2 | Claim de GOLD on-chain; conferir que o saldo do banco zera e volta se a tx falhar |
| 3 | Loja: mint de item NFT pagando GOLD; metadata resolvendo pelo baseURI |
| 4 | Mercado de itens: listar, comprar de outra conta, conferir a queima de 2% |
| 5 | PvP ranqueado até o piso de partidas; conferir pontuação e antifarm de par |
| 6 | Fim da temporada curta: `cron/season` vira, ou forçar o snapshot: `POST /api/ranking/payout` (admin). Conferir `/admin/season`: top 20, carteiras, cofre |
| 7 | Reincidência: segunda temporada, cortesia de virada (`grantGraceEntries`), e revisão dos logs da semana |

Durante todos os dias: **olhar erros** em `/api/gold/*`, `/api/store/*`,
`/api/character`, `/api/battle/rewards`.

## 7. Critérios para liberar a mainnet

Só vira produção com todos verdes:

- [ ] Nenhum erro de decimais em nenhum pagamento da semana
- [ ] `fundedDol` bate com `100 × personagens criados`, sem exceção
- [ ] Nenhum `DolPrizeContribution` duplicado (o `txHash @unique` segurou os retries)
- [ ] Fechamento de temporada produziu top 20 com carteira em todos os pagáveis,
      e `distribuído + cofre = pool`
- [ ] Claim de GOLD, mint de item e compra no mercado sem travar
- [ ] Nenhuma rota devolvendo 500 recorrente
- [ ] `npm run chain:test` e `npm run sim:season` verdes no commit que vai subir

## 8. Virada para a mainnet

Depois do ensaio, seguir `LAUNCH-MAINNET.md`. Cuidados que só aparecem por ter
passado pela Amoy:

- [ ] **Chaves de signer NOVAS** — as da Amoy ficam na Amoy
- [ ] `DOL_TOKEN_ADDRESS` → USDC nativa da Circle, **não** o TestUSDC
- [ ] `PVP_SEASON_DAYS` e `PVP_PAYOUT_MIN_MATCHES` de volta aos valores reais
- [ ] `SEASON_ENTRY_ENABLED` continua `false`
- [ ] Banco de produção separado do banco do ensaio
- [ ] `TestUSDC` **nunca** é deployado na mainnet (o script se recusa, mas confira)
