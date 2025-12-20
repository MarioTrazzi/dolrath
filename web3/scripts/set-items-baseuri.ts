import { ethers } from 'hardhat'

function ensureTrailingSlash(url: string): string {
  const s = String(url || '').trim()
  if (!s) return ''
  return s.endsWith('/') ? s : `${s}/`
}

async function main() {
  const [deployer] = await ethers.getSigners()

  const contractAddress = (process.env.ITEM_NFT_CONTRACT_ADDRESS || '').trim()
  if (!contractAddress) {
    throw new Error('Missing ITEM_NFT_CONTRACT_ADDRESS in web3/.env')
  }

  const baseURI = ensureTrailingSlash(process.env.ITEM_NFT_BASE_URI || '')
  if (!baseURI) {
    throw new Error('Missing ITEM_NFT_BASE_URI in web3/.env')
  }

  console.log('Setting DolrathItems baseURI...')
  console.log('Deployer:', deployer.address)
  console.log('Contract:', contractAddress)
  console.log('BaseURI:', baseURI)

  const items = await ethers.getContractAt('DolrathItems', contractAddress)
  const tx = await items.setBaseURI(baseURI)
  console.log('TX:', tx.hash)
  const rc = await tx.wait()
  if (!rc || rc.status !== 1) throw new Error('setBaseURI failed')

  console.log('OK')
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
