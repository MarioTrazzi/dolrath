import { auth } from '@/app/api/auth/[...nextauth]/route'
import { rateLimitAllow, rateLimited429 } from '@/lib/rateLimit'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { verifyGoldTransferTx } from '@/lib/goldPayments'
import { computeItemKey, computePurchaseId, signItemMintRequest } from '@/lib/itemNftSigning'
import { Contract, parseUnits } from 'ethers'
import { getGoldProvider, getGoldContractAddress } from '@/lib/goldOnchain'

const ERC20_DECIMALS_ABI = ['function decimals() view returns (uint8)'] as const

function isHex32Bytes(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash)
}

export async function POST(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // A resposta carrega uma assinatura EIP-712 do servidor — throttle por usuário.
  if (!rateLimitAllow(`store-purchase-intent:${session.user.id}`, { windowMs: 60_000, max: 10 })) {
    return rateLimited429()
  }

  try {
    const body = await req.json()
    const itemId = String(body?.itemId || '').trim()
    const paymentTxHash = String(body?.paymentTxHash || '').trim()

    if (!itemId) {
      return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
    }

    if (!paymentTxHash || !isHex32Bytes(paymentTxHash)) {
      return NextResponse.json({ error: 'Invalid paymentTxHash' }, { status: 400 })
    }

    const item = await prisma.item.findUnique({ where: { id: itemId } })
    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 })
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const walletAddress = String((user as any).walletAddress || '').trim()
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet required', requiresWallet: true }, { status: 403 })
    }

    const treasuryAddress =
      (process.env.GOLD_TREASURY_ADDRESS || '').trim() ||
      (process.env.DOL_TREASURY_ADDRESS || '').trim() ||
      (process.env.NEXT_PUBLIC_DOL_TREASURY_ADDRESS || '').trim()

    if (!treasuryAddress) {
      return NextResponse.json(
        { error: 'Server missing GOLD_TREASURY_ADDRESS (or DOL_TREASURY_ADDRESS)' },
        { status: 500 }
      )
    }

    const goldContractAddress = getGoldContractAddress()
    if (!goldContractAddress) {
      return NextResponse.json({ error: 'Missing GOLD_CONTRACT_ADDRESS' }, { status: 500 })
    }

    // Verify on-chain payment (GOLD transfer -> treasury).
    await verifyGoldTransferTx({
      txHash: paymentTxHash,
      expectedFrom: walletAddress,
      expectedTo: treasuryAddress,
      minAmountHuman: String(item.goldPrice),
      tokenAddress: goldContractAddress,
    })

    // Compute exact paidGold in base units (match decimals).
    const provider = getGoldProvider()
    const gold = new Contract(goldContractAddress, ERC20_DECIMALS_ABI, provider)
    const decimals = Number(await gold.decimals())

    // Price is stored as human units (e.g. 1000). Convert to base.
    const paidGold = parseUnits(String(item.goldPrice), decimals)

    const purchaseId = computePurchaseId({ paymentTxHash, itemId, to: walletAddress })
    const itemKey = computeItemKey(itemId)

    // tokenURI VAZIO de propósito: o contrato cai em baseURI + tokenId e a
    // metadata é servida AO VIVO por /api/nft/item/metadata/<tokenId>. Requer
    // ITEM_NFT_BASE_URI setado no contrato.
    const tokenURI = ''

    const nowSec = Math.floor(Date.now() / 1000)
    const deadline = BigInt(nowSec + 15 * 60)

    const signed = await signItemMintRequest({
      to: walletAddress,
      purchaseId,
      itemKey,
      paidGold,
      tokenURI,
      deadline,
    })

    return NextResponse.json({
      mint: {
        to: walletAddress,
        purchaseId,
        itemKey,
        paidGold: paidGold.toString(),
        tokenURI,
        deadline: deadline.toString(),
        signature: signed.signature,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create purchase intent'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
