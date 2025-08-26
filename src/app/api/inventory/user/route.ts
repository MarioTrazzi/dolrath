import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const userInventory = await prisma.userInventory.findMany({
      where: {
        userId: session.user.id,
      },
      include: {
        item: true,
      },
      orderBy: {
        item: {
          name: 'asc',
        },
      },
    });

    return NextResponse.json(userInventory);
  } catch (error) {
    console.error('Error fetching user inventory:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user inventory' },
      { status: 500 }
    );
  }
}
