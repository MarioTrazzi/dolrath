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

    // Preço fixo: +5 slots custa 1000 GOLD (espelha o do personagem).
    const expectedSlots = 5;
    const goldCost = 1000;
    const goldCostHuman = String(goldCost);

    if (Number(slots) !== expectedSlots) {
      return NextResponse.json(
        { error: `Invalid slots amount. Expected ${expectedSlots}.` },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({ where: { id: session.user.id } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const txHashStr = (typeof txHash === 'string' ? txHash : '').trim();

    // ── Caminho OFF-CHAIN (sem txHash): paga com o GOLD do BANCO/Baú Geral
    // (User.goldBalance). Se não tiver o suficiente, devolve 402 pedindo pagamento
    // on-chain — o cliente então abre a tela de compra pela carteira. ──
    if (!txHashStr) {
      if (user.goldBalance < goldCost) {
        return NextResponse.json(
          {
            error: `GOLD insuficiente no banco (tem ${user.goldBalance}, precisa de ${goldCost}). Compre on-chain.`,
            requiresPayment: true,
            amountGold: goldCostHuman,
            bankGold: user.goldBalance,
          },
          { status: 402 }
        );
      }

      const updated = await prisma.$transaction(async (tx) => {
        const fresh = await tx.user.findUnique({
          where: { id: session.user!.id },
          select: { goldBalance: true },
        });
        if (!fresh || fresh.goldBalance < goldCost) {
          throw new Error(`GOLD insuficiente no banco (precisa de ${goldCost}).`);
        }
        return tx.user.update({
          where: { id: session.user!.id },
          data: {
            goldBalance: { decrement: goldCost },
            globalInventorySlots: { increment: slots },
          },
          select: { globalInventorySlots: true, goldBalance: true },
        });
      });

      return NextResponse.json(
        jsonSafe({
          globalInventorySlots: updated.globalInventorySlots,
          cost: goldCost,
          newSlots: updated.globalInventorySlots,
          bankGold: updated.goldBalance,
          paidWith: 'offchain',
        })
      );
    }

    // ── Caminho ON-CHAIN (txHash presente): verifica a transferência de GOLD
    // para a treasury e só então expande. ──
    if (!isHex32Bytes(txHashStr)) {
      return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 })
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
