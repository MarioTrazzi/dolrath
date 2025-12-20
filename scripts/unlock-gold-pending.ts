import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const walletAddressRaw = process.argv[2]

  if (!walletAddressRaw) {
    throw new Error('Usage: npx ts-node scripts/unlock-gold-pending.ts <walletAddress>')
  }

  const walletAddress = walletAddressRaw.trim()

  const user = (await prisma.user.findFirst({
    where: {
      walletAddress: {
        equals: walletAddress,
        mode: 'insensitive',
      },
    },
    select: {
      id: true,
      email: true,
      walletAddress: true,
      goldBalance: true,
      goldClaimPendingAmount: true,
      goldClaimPendingNonce: true,
      goldClaimPendingDeadline: true,
    },
  })) as any

  if (!user) {
    throw new Error(`No user found with walletAddress=${walletAddress}`)
  }

  const pendingAmount = Number(user.goldClaimPendingAmount ?? 0)
  const hasPending =
    pendingAmount > 0 &&
    user.goldClaimPendingNonce != null &&
    user.goldClaimPendingDeadline != null

  if (!hasPending) {
    console.log('No pending GOLD claim to unlock')
    console.log({
      userId: user.id,
      email: user.email,
      walletAddress: user.walletAddress,
      goldBalance: user.goldBalance,
    })
    return
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      goldBalance: { increment: pendingAmount },
      goldClaimPendingAmount: 0,
      goldClaimPendingNonce: null,
      goldClaimPendingDeadline: null,
      goldClaimPendingCreatedAt: null,
      goldClaimPendingTxHash: null,
    },
    select: {
      id: true,
      email: true,
      walletAddress: true,
      goldBalance: true,
      goldClaimPendingAmount: true,
      goldClaimPendingNonce: true,
      goldClaimPendingDeadline: true,
    },
  })

  console.log('Unlocked pending GOLD claim back to goldBalance')
  console.log({
    userId: updated.id,
    email: updated.email,
    walletAddress: updated.walletAddress,
    goldBalance: updated.goldBalance,
    goldClaimPendingAmount: updated.goldClaimPendingAmount,
  })
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {})
  })
