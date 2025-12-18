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
- Mint (Amoy): set `DOL_TOKEN_ADDRESS`, `DOL_MINT_TO`, `DOL_MINT_AMOUNT` then run `npm run chain:mint:amoy`

## Contract

- `DolToken` (ERC-20)
  - Name: `Dolrath Gold`
  - Symbol: `DOL`
  - `MINTER_ROLE` can mint (useful for controlled withdrawals)
