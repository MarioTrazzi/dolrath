import { ethers } from 'hardhat'

// DOL v2 has a fixed supply (no mint). This script now TRANSFERS DOL from the
// signer (deployer/treasury) to fund wallets on testnet. Env var names were
// kept so the chain:mint:amoy workflow keeps working.
async function main() {
  const tokenAddress = (process.env.DOL_TOKEN_ADDRESS || '').trim()
  const to = (process.env.DOL_MINT_TO || '').trim()
  const amountHuman = (process.env.DOL_MINT_AMOUNT || '').trim()

  if (!tokenAddress) throw new Error('Missing DOL_TOKEN_ADDRESS')
  if (!to) throw new Error('Missing DOL_MINT_TO')
  if (!amountHuman) throw new Error('Missing DOL_MINT_AMOUNT')

  const [sender] = await ethers.getSigners()
  if (!sender) throw new Error('No signer available')

  const dol = await ethers.getContractAt('DolToken', tokenAddress)
  const decimals = await dol.decimals()
  const amount = ethers.parseUnits(amountHuman, decimals)

  const tx = await dol.transfer(to, amount)
  console.log('Transfer tx:', tx.hash, '(from', sender.address + ')')
  await tx.wait()

  const newBal = await dol.balanceOf(to)
  console.log('New balance:', ethers.formatUnits(newBal, decimals))
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
