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
- `DolrathGold` (ERC-20) — GOLD, claim via server signature (EIP-712), burnable, signer rotatable (`setSigner`, owner-only)
- `DolrathCharacters` / `DolrathItems` (ERC-721) — NFTs (server-signed mints), signer rotatable (`setSigner`, owner-only)
- `DolrathItemMarket` — escrow market in **GOLD** · fee 4% = 2% real burn + 2% treasury
- `DolrathCharacterMarket` — escrow market in **DOL** · fee 5% = 2.5% real burn + 2.5% treasury
  - Currency invariant: items trade ONLY in GOLD, characters ONLY in DOL
  - Fees are owner-settable via `setFees(burnBps, treasuryBps)` with a hard cap of 10% total
  - Markets take `feeTreasury` in the constructor (`GOLD_TREASURY_ADDRESS` / `DOL_FEE_TREASURY_ADDRESS`)
  - `pause()`/`unpause()` (owner-only) block `createListing`/`buy`; `cancelListing` always works
  - `rescueERC721(token, tokenId, to)` (owner-only) recovers NFTs sent directly to the market; refuses tokens escrowed by an active listing

## Deploy checklist — Amoy rehearsal (`:amoy`) or MAINNET (`:polygon`)

Key roles (mainnet: use FOUR distinct wallets — never reuse the treasury as a signer):
- `DOL_TREASURY_ADDRESS` → Safe multisig (holds the 1B DOL)
- deployer (`DEPLOYER_PRIVATE_KEY`) → throwaway wallet funded with a little POL
- `GOLD_SIGNER_ADDRESS` / `NFT_SIGNER_ADDRESS` / `ITEM_NFT_SIGNER_ADDRESS` → dedicated server hot wallets

Order (replace `:polygon` with `:amoy` to rehearse):
1. `npm run chain:deploy:polygon` (DolToken v2 → mints 1B to the treasury) → update `DOL_TOKEN_ADDRESS`
2. `npm run chain:deploy:gold:polygon` → update `GOLD_CONTRACT_ADDRESS`
3. `npm run chain:deploy:characters:polygon` → update `CHARACTER_NFT_CONTRACT_ADDRESS`
4. `npm run chain:deploy:items:polygon` → update `ITEM_NFT_CONTRACT_ADDRESS`
5. `npm run chain:baseuri:polygon` (`ITEM_NFT_BASE_URI` = production metadata URL)
6. `npm run chain:deploy:market:polygon` → update `ITEM_MARKET_CONTRACT_ADDRESS`
7. `npm run chain:deploy:character-market:polygon` → update `CHARACTER_MARKET_CONTRACT_ADDRESS`
8. Verify all contracts on Polygonscan (`npx hardhat verify --network polygon <address> <constructor args>`)
9. Transfer ownership of Gold, Characters, Items and both markets to the Safe
10. Update Vercel prod envs: all addresses, `*_CHAIN_ID=137`, mainnet RPCs, signer private keys
11. Smoke test with a real wallet: GOLD claim, item mint, listing + buy on both markets
