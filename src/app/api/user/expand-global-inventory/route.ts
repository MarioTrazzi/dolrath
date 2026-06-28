import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { verifyGoldTransferTx } from '@/lib/goldPayments';

function isHex32Bytes(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash)
}

function jsonSafe<T>(value: T): any {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  )
}

// 🌐 Expande o Baú Geral da conta (User.globalInventorySlots). Mesmo modelo do
// expand-inventory do personagem: pagamento on-chain em GOLD para a treasury.
export async function POST(req: NextRequest) {
  const session = await auth();

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { slots, txHash } = await req.json();

    if (!slots || slots <= 0) {
      return NextResponse.json({ error: 'Invalid number of slots' }, { status: 400 });
    }

    // Preço fixo (on-chain GOLD): +5 slots custa 1000 GOLD (espelha o do personagem).
    const expectedSlots = 5;
    const goldCostHuman = '1000';

    if (Number(slots) !== expectedSlots) {
      return NextResponse.json(
        { error: `Invalid slots amount. Expected ${expectedSlots}.` },
        { status: 400 }
      );
    }

    const txHashStr = (typeof txHash === 'string' ? txHash : '').trim();
    if (!txHashStr) {
      return NextResponse.json(
        { error: 'On-chain payment required', requiresPayment: true, amountGold: goldCostHuman },
        { status: 402 }
      );
    }

    if (!isHex32Bytes(txHashStr)) {
      return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const walletAddress = String((user as any).walletAddress || '').trim();
    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet required', requiresWallet: true },
        { status: 403 }
      );
    }

    const treasuryAddress =
      (process.env.GOLD_TREASURY_ADDRESS || '').trim() ||
      (process.env.DOL_TREASURY_ADDRESS || '').trim() ||
      (process.env.NEXT_PUBLIC_DOL_TREASURY_ADDRESS || '').trim();

    if (!treasuryAddress) {
      return NextResponse.json(
        { error: 'Server missing GOLD_TREASURY_ADDRESS (or DOL_TREASURY_ADDRESS)' },
        { status: 500 }
      );
    }

    // Verifica a transferência on-chain de GOLD para a treasury.
    try {
      await verifyGoldTransferTx({
        txHash: txHashStr,
        expectedFrom: walletAddress,
        expectedTo: treasuryAddress,
        minAmountHuman: goldCostHuman,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid payment'
      return NextResponse.json(jsonSafe({ error: message }), { status: 400 })
    }

    const updated = await prisma.user.update({
      where: { id: session.user.id },
      data: { globalInventorySlots: { increment: slots } },
      select: { globalInventorySlots: true },
    });

    return NextResponse.json(
      jsonSafe({
        globalInventorySlots: updated.globalInventorySlots,
        cost: Number(goldCostHuman),
        newSlots: updated.globalInventorySlots,
      })
    );
  } catch (error) {
    console.error('Error expanding global inventory slots:', error);
    const message = error instanceof Error ? error.message : 'Failed to expand global inventory slots'
    return NextResponse.json(jsonSafe({ error: message }), { status: 500 })
  }
}
