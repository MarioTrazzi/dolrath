import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { verifyGoldTransferTx } from '@/lib/goldPayments';

export const dynamic = 'force-dynamic';

function isHex32Bytes(txHash: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(txHash);
}

function jsonSafe<T>(value: T): any {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  );
}

// 💰 RECARGA de GOLD on-chain → saldo off-chain do personagem (Character.gold).
// O jogador transfere GOLD (ERC-20) para a tesouraria; o servidor verifica o
// evento Transfer e credita o MESMO valor em Character.gold. É esse gold "na mão"
// que a loja do ferreiro/alquimista consome (a compra do item segue off-chain —
// comprar item-NFT direto na loja fica fora da lore; isso é papel do market).
// O txHash é registrado (GoldTopup.txHash @unique) para impedir replay (crédito
// duplo). O valor creditado é o ACTUAL transferido on-chain, nunca o que o
// cliente diz — impossível super-creditar.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const userId = session.user.id;

  try {
    const { txHash, characterId } = await req.json();

    const txHashStr = (typeof txHash === 'string' ? txHash : '').trim();
    if (!isHex32Bytes(txHashStr)) {
      return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 });
    }
    if (!characterId || typeof characterId !== 'string') {
      return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 });
    }

    const character = await prisma.character.findFirst({ where: { id: characterId, userId } });
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const walletAddress = String((user as any)?.walletAddress || '').trim();
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

    // Rejeita cedo se este txHash já foi creditado (antes de gastar RPC).
    const already = await prisma.goldTopup.findUnique({ where: { txHash: txHashStr } });
    if (already) {
      return NextResponse.json(
        { error: 'Esta transação já foi creditada.', alreadyCredited: true },
        { status: 409 }
      );
    }

    // Verifica a transferência de GOLD (>= 1) do wallet do usuário para a tesouraria.
    let verified;
    try {
      verified = await verifyGoldTransferTx({
        txHash: txHashStr,
        expectedFrom: walletAddress,
        expectedTo: treasuryAddress,
        minAmountHuman: '1',
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Invalid payment';
      return NextResponse.json(jsonSafe({ error: message }), { status: 400 });
    }

    // Credita o valor REAL transferido (piso em gold inteiro). goldBalance/Character.gold são Int.
    const amount = Math.floor(Number(verified.formatted));
    if (!Number.isFinite(amount) || amount < 1) {
      return NextResponse.json({ error: 'Valor transferido inválido' }, { status: 400 });
    }

    // Dedup + crédito atômico: cria o registro (txHash único) ANTES de creditar.
    // Uma corrida com o mesmo txHash aborta no unique e nada é creditado.
    try {
      const updated = await prisma.$transaction(async (tx) => {
        await tx.goldTopup.create({
          data: { txHash: txHashStr, userId, characterId, amount },
        });
        return tx.character.update({
          where: { id: characterId },
          data: { gold: { increment: amount } },
          select: { gold: true },
        });
      });

      return NextResponse.json(
        jsonSafe({ credited: amount, characterGold: updated.gold })
      );
    } catch (e: any) {
      if (e?.code === 'P2002') {
        return NextResponse.json(
          { error: 'Esta transação já foi creditada.', alreadyCredited: true },
          { status: 409 }
        );
      }
      throw e;
    }
  } catch (error) {
    console.error('Error buying gold (topup):', error);
    const message = error instanceof Error ? error.message : 'Falha ao recarregar GOLD';
    return NextResponse.json(jsonSafe({ error: message }), { status: 500 });
  }
}
