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

    // A loja vende APENAS itens explicitamente de origem "shop" (catálogo final).
    // Itens sem `source` (pedras de aprimoramento, materiais, gear legado) NÃO
    // aparecem — são obtidos em masmorras/aventuras.
    const shopItems = items.filter((item) => {
      const stats = (item.stats ?? {}) as Record<string, any>;
      if (stats.source !== 'shop') return false;

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
