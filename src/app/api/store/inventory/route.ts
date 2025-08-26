import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const characterId = searchParams.get('characterId');

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

      const inventory = await prisma.characterInventory.findMany({
        where: {
          characterId: characterId,
        },
        include: {
          item: true,
        },
      });

      return NextResponse.json(inventory);
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
