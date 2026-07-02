# Web3 (Polygon / EVM)

This folder contains the on-chain contracts and deployment tooling for Dolrath.

## Setup

Create an env file:

- Copy `web3/.env.example` to `.env.local` (or export vars in your shell)

## Commands (from repo root)

- Compile: `npm run chain:compile`
- Test: `npm run chain:test`
- Deploy to Amoy: `npm run chain:deploy:amoy`
- Deploy Characters NFT (Amoy): `npm run chain:deploy:characters:amoy`
- Fund a wallet with DOL (Amoy): set `DOL_TOKEN_ADDRESS`, `DOL_MINT_TO`, `DOL_MINT_AMOUNT` then run `npm run chain:mint:amoy` (transfers from the signer — DOL v2 has no mint)

## Contracts

- `DolToken` (ERC-20) — **v2, fixed supply**
  - Name: `Dolrath` · Symbol: `DOL`
  - 1,000,000,000 DOL minted once at deploy to `DOL_TREASURY_ADDRESS` (or deployer)
  - No mint function; burnable (supply can only shrink)
- `DolrathGold` (ERC-20) — GOLD, claim via server signature (EIP-712), burnable
- `DolrathCharacters` / `DolrathItems` (ERC-721) — NFTs (server-signed mints)
- `DolrathItemMarket` — escrow market in GOLD · fee 4% = 2% real burn + 2% treasury
- `DolrathCharacterMarket` — escrow market in DOL · fee 5% = 2.5% real burn + 2.5% treasury
  - Fees are owner-settable via `setFees(burnBps, treasuryBps)` with a hard cap of 10% total
  - Markets take `feeTreasury` in the constructor (`GOLD_TREASURY_ADDRESS` / `DOL_FEE_TREASURY_ADDRESS`)

## Redeploy checklist (v2)

1. `npm run chain:deploy:amoy` (DolToken v2) → update `DOL_TOKEN_ADDRESS` everywhere (web3/.env + Vercel)
2. `npm run chain:deploy:gold:amoy` (GOLD now burnable) → update `GOLD_CONTRACT_ADDRESS`
3. `npm run chain:deploy:market:amoy` → update `ITEM_MARKET_CONTRACT_ADDRESS`
4. `npm run chain:deploy:character-market:amoy` → update `CHARACTER_MARKET_CONTRACT_ADDRESS`
5. Fund test wallets with `chain:mint:amoy` (transfer) and re-check `/marketplace`
