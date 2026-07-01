# 08 — NFT System

## Filosofia

NFT em Dolrath é **propriedade opcional**, nunca paywall. Todo item e personagem funciona 100% off-chain; o mint acontece quando o jogador decide listar/possuir on-chain. Isso mantém o onboarding sem fricção e faz do NFT uma escolha econômica, não uma obrigação.

## Ativos on-chain (Polygon)

| Ativo | Contrato | Padrão | Estado |
|---|---|---|---|
| Personagens | `DolrathCharacters.sol` | ERC-721 | AO VIVO (testnet Amoy) |
| Itens | `DolrathItems.sol` | ERC-721 lazy-mint (voucher EIP-712) | AO VIVO |
| GOLD | `DolrathGold.sol` | ERC-20 claim assinado | AO VIVO |
| DOL | `DolToken.sol` | ERC-20 | AO VIVO |

## Metadata viva

- **Herói:** o tokenURI reflete XP/nível **ao vivo** — o NFT evolui com o personagem (`src/lib/characterNftMetadata.ts`).
- **Item:** metadata via `baseURI + tokenId` (exige `ITEM_NFT_BASE_URI` configurada on-chain na mainnet); o **`enhancementLevel` (+N) é congelado no momento do mint** e exibido nas listagens (`ItemNft.enhancementLevel`, `mintSource`).

## Lazy-mint de itens (fluxo de listagem)

1. `POST /api/marketplace/list-intent` — servidor assina voucher de mint para item ganho em jogo e **trava a linha do inventário** (`listingLockedAt`, 20 min).
2. Jogador executa `mintWithSig` on-chain (paga só gas).
3. `POST /api/marketplace/list-confirm` — servidor verifica o mint, **queima a linha off-chain** e grava `ItemNft`.
4. `setApprovalForAll` + `createListing` no `DolrathItemMarket`.

Anti-duplicação: `sell-item` e `equip-item` recusam peça travada. Vetores residuais documentados: `transfer-item` entre personagens do mesmo usuário.

## Gaps conhecidos (honestidade de engenharia)

- Comprar NFT no mercado **ainda não re-hidrata** o item para `CharacterInventory` jogável (a loja sincroniza para `UserInventory`) — round-trip completo é a próxima feature.
- `CHARACTER_MARKET` codado, deploy pendente.

## EM BREVE

- **Aluguel de NFTs** (scholarship saudável — ver [EDD §Aluguel](../07-economy/GAME-ECONOMY-DESIGN.md)).
- **Conquistas soulbound** (marcos não-transferíveis).
- **Royalties de criador** no padrão ERC-2981 quando os marketplaces ganharem taxa.
