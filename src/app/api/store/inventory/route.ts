import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { resolveStaleListingLocks } from '@/lib/listingLock';

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const characterId = searchParams.get('characterId');
    // 🌐 Opt-in: anexa o Baú Geral da conta ao resultado. As bancadas de
    // profissão (Forja/Alquimia/Processamento/Culinária) consomem dos DOIS
    // inventários (src/lib/materialPool.ts), então precisam contar os dois.
    // É opt-in de propósito: a ficha e a loja leem esta mesma rota para saber
    // o que está NA MOCHILA, e vazar o baú ali quebraria a contagem de slots.
    const includeGlobal = searchParams.get('includeGlobal') === '1';

    if (characterId) {
      // Get inventory for specific character
      const character = await prisma.character.findFirst({
        where: {
          id: characterId,
          userId: session.user.id,
        },
      });

      if (!character) {
        return NextResponse.json({ error: 'Character not found' }, { status: 404 });
      }

      // 🪙 Listagens abandonadas (voucher vencido) se resolvem ao abrir a mochila:
      // a peça volta a ser usável, ou vira a NFT que já foi mintada.
      await resolveStaleListingLocks(characterId).catch(() => {});

      const inventory = await prisma.characterInventory.findMany({
        where: {
          characterId: characterId,
          // Linha zerada é fantasma (herança do consumo antigo, que decrementava
          // até 0 sem apagar): aparecia na mochila mas não dava pra usar,
          // transferir nem mandar pro Baú Geral.
          quantity: { gt: 0 },
        },
        include: {
          item: true,
        },
      });

      if (!includeGlobal) return NextResponse.json(inventory);

      const globalRows = await prisma.userInventory.findMany({
        where: { userId: session.user.id, quantity: { gt: 0 } },
        include: { item: true },
      });

      // O id vai prefixado: linha do baú não é linha de CharacterInventory, e
      // mandá-la sem querer para uma ação do personagem acharia nada (ou pior,
      // outra linha). O `source` é o que a bancada usa para dizer "4 vieram do baú".
      return NextResponse.json([
        ...inventory.map((row) => ({ ...row, source: 'character' as const })),
        ...globalRows.map((row) => ({
          id: `global:${row.id}`,
          itemId: row.itemId,
          characterId: null,
          quantity: row.quantity,
          // O Baú Geral é pilha pura: não guarda +N nem desgaste. Os valores
          // fixos aqui mantêm a forma da linha compatível com a da mochila.
          enhancementLevel: 0,
          durability: 100,
          maxDurability: 100,
          source: 'global' as const,
          item: row.item,
        })),
      ]);
    } else {
      // Get inventory from all characters (for backward compatibility)
      const characters = await prisma.character.findMany({
        where: {
          userId: session.user.id,
        },
        select: {
          id: true,
        },
      });

      if (characters.length === 0) {
        return NextResponse.json([]);
      }

      // Get inventory from all characters
      const inventory = await prisma.characterInventory.findMany({
        where: {
          characterId: {
            in: characters.map(c => c.id),
          },
          quantity: { gt: 0 },
        },
        include: {
          item: true,
        },
      });

      return NextResponse.json(inventory);
    }
  } catch (error) {
    console.error('Error fetching user inventory:', error);
    return NextResponse.json(
      { error: 'Failed to fetch inventory' },
      { status: 500 }
    );
  }
}
