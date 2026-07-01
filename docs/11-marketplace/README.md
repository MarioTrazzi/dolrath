# 11 — Marketplace

## Mercados vivos

| Mercado | Moeda | Contrato | Estado |
|---|---|---|---|
| Itens (NFT) | GOLD | `DolrathItemMarket.sol` — escrow simples | AO VIVO (página `/marketplace`) |
| Personagens (NFT) | DOL | `DolrathCharacterMarket.sol` — escrow simples | código pronto, **deploy pendente** |
| Loja (NPC) | GOLD | off-chain + on-chain (compra NFT) | AO VIVO |

## Como funciona (itens)

1. **Vender:** item ganho em jogo passa pelo lazy-mint (ver [NFT System](../08-nft-system/README.md)), depois `createListing(tokenId, priceGold)` — o NFT fica em escrow no contrato.
2. **Comprar:** `approve` de GOLD + `buy(listingId)` — GOLD vai 100% ao vendedor, NFT ao comprador.
3. **Cancelar:** vendedor resgata o NFT do escrow.

Preço é fixo por listagem (sem leilão ainda). `getActiveListingIds()` alimenta a página de browse.

## ⚠️ Decisão econômica pendente: taxa de protocolo

Hoje **os marketplaces não cobram taxa nenhuma** — 100% do valor vai ao vendedor (única fricção: gas). Isso significa que o maior ponto de circulação de valor do jogo **não contribui com nenhum sink**.

**Proposta (whitepaper):**
- Itens (GOLD): taxa de **4%** — 2% queimado, 2% treasury.
- Personagens (DOL): taxa de **5%** — 2,5% queimado, 2,5% treasury (financia recompensas de temporada).
- Implementação: adicionar `feeBps` + `feeRecipient` + split de burn nos contratos **antes do deploy mainnet** (mudança pequena; os contratos são simples e o `CharacterMarket` ainda nem foi deployado).

## Sistemas EM BREVE

| Sistema | Desenho resumido |
|---|---|
| **Leilões** | leilão inglês com duração fixa p/ itens lendários e personagens raros; anti-snipe (+5 min se lance no fim) |
| **Aluguel de NFTs** | dono lista personagem/item p/ aluguel com split de GOLD ganho; contrato de rental sem custódia do lucro pelo locatário |
| **Ofertas (bids em item não listado)** | fase 2 do marketplace |
| **Histórico de preços e floor** | indexação dos eventos `ListingPurchased` |

Detalhes econômicos: [EDD §Marketplace / §Aluguel / §Leilões / §Taxas](../07-economy/GAME-ECONOMY-DESIGN.md).
