import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { recordInventoryExpansion } from '@/lib/characterHistory';
import { verifyGoldTransferTx } from '@/lib/goldPayments';

function isHex32Bytes(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash)
}

function jsonSafe<T>(value: T): any {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  )
}

export async function POST(
  req: NextRequest,
  { params }: { params: { characterId: string } }
) {
  const session = await auth();

  if (!session || !session.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { slots, txHash } = await req.json();

    if (!slots || slots <= 0) {
      return NextResponse.json(
        { error: 'Invalid number of slots' },
        { status: 400 }
      );
    }

    // Preço fixo: +5 slots custa 1000 GOLD.
    const expectedSlots = 5;
    const goldCost = 1000;
    const goldCostHuman = String(goldCost);

    if (Number(slots) !== expectedSlots) {
      return NextResponse.json(
        { error: `Invalid slots amount. Expected ${expectedSlots}.` },
        { status: 400 }
      );
    }

    // Verificar se o personagem pertence ao usuário
    const character = await prisma.character.findFirst({
      where: {
        id: params.characterId,
        userId: session.user.id,
      },
    });

    if (!character) {
      return NextResponse.json(
        { error: 'Character not found' },
        { status: 404 }
      );
    }

    const currentSlots = character.inventorySlots;
    const txHashStr = (typeof txHash === 'string' ? txHash : '').trim();

    // ── Caminho OFF-CHAIN (sem txHash): paga com o GOLD "na mão" do personagem
    // (Character.gold). Se não tiver o suficiente, devolve 402 pedindo pagamento
    // on-chain — o cliente então abre a tela de compra pela carteira. ──
    if (!txHashStr) {
      if (character.gold < goldCost) {
        return NextResponse.json(
          {
            error: `GOLD insuficiente na mão (tem ${character.gold}, precisa de ${goldCost}). Compre on-chain.`,
            requiresPayment: true,
            amountGold: goldCostHuman,
            characterGold: character.gold,
          },
          { status: 402 }
        );
      }

      // Transação atômica: revalida o gold e debita + expande de uma vez.
      const result = await prisma.$transaction(async (tx) => {
        const fresh = await tx.character.findUnique({
          where: { id: params.characterId },
          select: { gold: true },
        });
        if (!fresh || fresh.gold < goldCost) {
          throw new Error(`GOLD insuficiente na mão (precisa de ${goldCost}).`);
        }
        return tx.character.update({
          where: { id: params.characterId },
          data: {
            gold: { decrement: goldCost },
            inventorySlots: { increment: slots },
          },
        });
      });

      try {
        await recordInventoryExpansion(params.characterId, currentSlots, result.inventorySlots, goldCost);
      } catch (historyError) {
        console.error('Erro ao registrar histórico:', historyError);
      }

      return NextResponse.json(
        jsonSafe({
          character: result,
          cost: goldCost,
          newSlots: result.inventorySlots,
          characterGold: result.gold,
          paidWith: 'offchain',
        })
      );
    }

    // ── Caminho ON-CHAIN (txHash presente): verifica a transferência de GOLD
    // para a treasury e só então expande. ──
    if (!isHex32Bytes(txHashStr)) {
      return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 })
    }

    // Buscar o usuário para verificar o gold
    const user = await prisma.user.findUnique({
      where: {
        id: session.user.id,
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
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

    // Verify on-chain GOLD transfer to treasury.
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

    // Usar uma transação para garantir atomicidade
    const result = await prisma.$transaction(async (tx) => {
      // Atualizar slots do personagem
      const updatedCharacter = await tx.character.update({
        where: {
          id: params.characterId,
        },
        data: {
          inventorySlots: {
            increment: slots,
          },
        },
      });

      return updatedCharacter;
    });

    // Registrar no histórico
    try {
      await recordInventoryExpansion(params.characterId, currentSlots, result.inventorySlots, Number(goldCostHuman));
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError);
      // Não falhar a operação por causa do histórico
    }

    return NextResponse.json(
      jsonSafe({
        character: result,
        cost: Number(goldCostHuman),
        newSlots: result.inventorySlots,
      })
    );
  } catch (error) {
    console.error('Error expanding inventory slots:', error);
    const message = error instanceof Error ? error.message : 'Failed to expand inventory slots'
    return NextResponse.json(jsonSafe({ error: message }), { status: 500 })
  }
}
