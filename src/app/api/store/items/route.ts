import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const items = await prisma.item.findMany({
      orderBy: [
        { level: 'desc' },
        { goldPrice: 'desc' },
      ],
    });

    console.log(`API: Returning ${items.length} items`);
    
    // Mapear os dados para garantir que o campo price está correto
    const formattedItems = items.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      type: item.type,
      level: item.level,
      stats: item.stats,
      image: (item as any).image,
      price: item.goldPrice, // Mapear goldPrice para price
      goldPrice: item.goldPrice
    }));

    return NextResponse.json(formattedItems);
  } catch (error) {
    console.error('Error fetching store items:', error);
    return NextResponse.json(
      { error: 'Failed to fetch store items' },
      { status: 500 }
    );
  }
}
