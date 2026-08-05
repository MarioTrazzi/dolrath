import { ethers } from 'hardhat'

/**
 * Carga manual do dublê de USDC no ensaio da Amoy — contas de teste do estúdio
 * e bots da frota, que não vão ficar chamando faucet() a cada 12h.
 *
 * Envs: USDC_TOKEN_ADDRESS, USDC_MINT_TO (aceita lista separada por vírgula),
 *       USDC_MINT_AMOUNT (em USDC, ex. "500").
 */
async function main() {
  const tokenAddress = (process.env.USDC_TOKEN_ADDRESS || process.env.DOL_TOKEN_ADDRESS || '').trim()
  const toRaw = (process.env.USDC_MINT_TO || '').trim()
  const amountHuman = (process.env.USDC_MINT_AMOUNT || '500').trim()

  if (!tokenAddress) throw new Error('Missing USDC_TOKEN_ADDRESS')
  if (!toRaw) throw new Error('Missing USDC_MINT_TO')

  const recipients = toRaw
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean)

  const usdc = await ethers.getContractAt('TestUSDC', tokenAddress)
  const decimals = await usdc.decimals()
  if (Number(decimals) !== 6) {
    throw new Error(`Esperava 6 decimais, contrato reporta ${decimals}. Endereço errado?`)
  }

  const amount = ethers.parseUnits(amountHuman, decimals)

  for (const to of recipients) {
    const tx = await usdc.mint(to, amount)
    console.log(`mint ${amountHuman} tUSDC → ${to}  tx: ${tx.hash}`)
    await tx.wait()
    const bal = await usdc.balanceOf(to)
    console.log(`  saldo: ${ethers.formatUnits(bal, decimals)} tUSDC`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
