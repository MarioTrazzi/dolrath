import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { computeItemKey, computePurchaseId } from '@/lib/itemNftSigning'
import { verifyItemMintTx } from '@/lib/itemNftVerify'
import { Prisma } from '@prisma/client'
import { Contract, parseUnits } from 'ethers'
import { getGoldContractAddress, getGoldProvider } from '@/lib/goldOnchain'

const ERC20_DECIMALS_ABI = ['function decimals() view returns (uint8)'] as const

function isHex32Bytes(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash)
}

function isPrismaUniqueError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
}

export async function POST(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const itemId = String(body?.itemId || '').trim()
    const paymentTxHash = String(body?.paymentTxHash || '').trim()
    const mintTxHash = String(body?.mintTxHash || '').trim()

    if (!itemId) return NextResponse.json({ error: 'itemId is required' }, { status: 400 })
    if (!paymentTxHash || !isHex32Bytes(paymentTxHash)) {
      return NextResponse.json({ error: 'Invalid paymentTxHash' }, { status: 400 })
    }
    if (!mintTxHash || !isHex32Bytes(mintTxHash)) {
      return NextResponse.json({ error: 'Invalid mintTxHash' }, { status: 400 })
    }

    const item = await prisma.item.findUnique({ where: { id: itemId } })
    if (!item) return NextResponse.json({ error: 'Item not found' }, { status: 404 })

    const user = await prisma.user.findUnique({ where: { id: session.user.id } })
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

    const walletAddress = String((user as any).walletAddress || '').trim()
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet required', requiresWallet: true }, { status: 403 })
    }

    const purchaseId = computePurchaseId({ paymentTxHash, itemId, to: walletAddress })
    const expectedItemKey = computeItemKey(itemId)

    const goldTokenAddress = getGoldContractAddress()
    const goldProvider = getGoldProvider()
    const gold = new Contract(goldTokenAddress, ERC20_DECIMALS_ABI, goldProvider)
    const decimals = Number(await gold.decimals())

    const expectedMinPaidGold = parseUnits(String(item.goldPrice), decimals)

    const verified = await verifyItemMintTx({
      txHash: mintTxHash,
      expectedTo: walletAddress,
      expectedPurchaseId: purchaseId,
      expectedItemKey,
      expectedMinPaidGold,
    })

    const contract = (process.env.ITEM_NFT_CONTRACT_ADDRESS || '').trim()
    if (!contract) {
      return NextResponse.json({ error: 'Missing ITEM_NFT_CONTRACT_ADDRESS' }, { status: 500 })
    }

    const chainIdRaw = (process.env.ITEM_NFT_CHAIN_ID || '80002').trim()
    const chainId = Number(chainIdRaw)
    if (!Number.isFinite(chainId) || chainId <= 0) {
      return NextResponse.json({ error: 'Invalid ITEM_NFT_CHAIN_ID' }, { status: 500 })
    }

    const syncInventoryForItem = async (tx: any) => {
      const existingInv = await tx.userInventory.findFirst({
        where: { userId: session.user.id, itemId },
      })

      if (!existingInv) {
        return tx.userInventory.create({
          data: { userId: session.user.id, itemId, quantity: 1 },
          include: { item: true },
        })
      }

      if (existingInv.quantity <= 0) {
        return tx.userInventory.update({
          where: { id: existingInv.id },
          data: { quantity: 1 },
          include: { item: true },
        })
      }

      return tx.userInventory.findUnique({ where: { id: existingInv.id }, include: { item: true } })
    }

    let result: any
    try {
      result = await prisma.$transaction(async (tx) => {
        // Idempotency: if we've already registered this mint/payment, don't double count.
        const existingNft =
          (await (tx as any).itemNft.findUnique({ where: { mintTxHash } })) ||
          (await (tx as any).itemNft.findUnique({ where: { purchaseTxHash: paymentTxHash } })) ||
          (await (tx as any).itemNft.findUnique({
            where: {
              chainId_contract_tokenId: {
                chainId,
                contract,
                tokenId: verified.tokenId,
              },
            },
          }))

        if (existingNft) {
          if (existingNft.userId !== session.user.id) {
            await (tx as any).itemNft.update({ where: { id: existingNft.id }, data: { userId: session.user.id } })
          }
          const inv = await syncInventoryForItem(tx)
          return { inv, nft: existingNft, alreadySynced: true }
        }

        // First time: create both inventory increment and NFT record atomically.
        const existingInv = await tx.userInventory.findFirst({
          where: { userId: session.user.id, itemId },
        })

        const inv = existingInv
          ? await tx.userInventory.update({
              where: { id: existingInv.id },
              data: { quantity: { increment: 1 } },
              include: { item: true },
            })
          : await tx.userInventory.create({
              data: { userId: session.user.id, itemId, quantity: 1 },
              include: { item: true },
            })

        const nft = await (tx as any).itemNft.create({
          data: {
            userId: session.user.id,
            itemId,
            chainId,
            contract,
            tokenId: verified.tokenId,
            paidGoldWei: verified.paidGold.toString(),
            purchaseTxHash: paymentTxHash,
            mintTxHash,
          },
        })

        return { inv, nft, alreadySynced: false }
      })
    } catch (e) {
      // If a unique constraint hit happens (e.g. user retries confirm), reconcile inventory.
      if (!isPrismaUniqueError(e)) throw e

      result = await prisma.$transaction(async (tx) => {
        const existingNft =
          (await (tx as any).itemNft.findUnique({ where: { mintTxHash } })) ||
          (await (tx as any).itemNft.findUnique({ where: { purchaseTxHash: paymentTxHash } })) ||
          (await (tx as any).itemNft.findUnique({
            where: {
              chainId_contract_tokenId: {
                chainId,
                contract,
                tokenId: verified.tokenId,
              },
            },
          }))

        const inv = await syncInventoryForItem(tx)
        return { inv, nft: existingNft, alreadySynced: true }
      })
    }

    return NextResponse.json({
      item: result.inv,
      tokenId: verified.tokenId.toString(),
      paidGoldWei: verified.paidGold.toString(),
      alreadySynced: Boolean(result.alreadySynced),
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to confirm purchase'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
