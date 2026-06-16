import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { resolveImageUrl } from '@/lib/imageUrl';
import { canRaceEquip, ItemTypeStr } from '@/lib/itemCatalog';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Raça do personagem ativo (opcional). Quando presente, filtra a vitrine
  // para mostrar só o que aquela raça pode equipar.
  const race = new URL(request.url).searchParams.get('race');

  try {
    const items = await prisma.item.findMany({
      orderBy: [
        { level: 'desc' },
        { goldPrice: 'desc' },
      ],
    });

    // A loja vende APENAS itens de origem "shop". Itens legados sem o campo
    // `source` (consumíveis básicos, pedras) são tratados como de loja.
    const shopItems = items.filter((item) => {
      const stats = (item.stats ?? {}) as Record<string, any>;
      const source = stats.source ?? 'shop';
      if (source !== 'shop') return false;

      // Filtro por raça do personagem ativo (peso de armadura + exclusividade).
      if (race) {
        const check = canRaceEquip(race, item.type as ItemTypeStr, stats.raceRestriction ?? null);
        if (!check.ok) return false;
      }
      return true;
    });

    console.log(`API: Returning ${shopItems.length}/${items.length} store items${race ? ` (race=${race})` : ''}`);

    // Mapear os dados para garantir que o campo price está correto
    const formattedItems = shopItems.map(item => ({
      id: item.id,
      name: item.name,
      description: item.description,
      type: item.type,
      level: item.level,
      stats: item.stats,
      image: resolveImageUrl(item.image) ?? item.image ?? null,
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
