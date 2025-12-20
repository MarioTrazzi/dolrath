import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const walletAddressRaw = process.argv[2]
  const amountRaw = process.argv[3]

  if (!walletAddressRaw) {
    throw new Error('Usage: npx ts-node scripts/grant-gold-to-wallet.ts <walletAddress> <amount>')
  }

  const amount = Number(amountRaw ?? 0)
  if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
    throw new Error('Amount must be a positive integer')
  }

  const walletAddress = walletAddressRaw.trim()

  const user = await prisma.user.findFirst({
    where: {
      walletAddress: {
        equals: walletAddress,
        mode: 'insensitive',
      },
    },
    select: { id: true, email: true, walletAddress: true, goldBalance: true },
  })

  if (!user) {
    throw new Error(`No user found with walletAddress=${walletAddress}`)
  }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: {
      goldBalance: { increment: amount },
    },
    select: { id: true, email: true, walletAddress: true, goldBalance: true },
  })

  console.log('Granted GOLD successfully')
  console.log({
    userId: updated.id,
    email: updated.email,
    walletAddress: updated.walletAddress,
    newGoldBalance: updated.goldBalance,
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
