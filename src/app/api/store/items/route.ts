import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { resolveImageUrl } from '@/lib/imageUrl';
import { canEquip, ItemTypeStr, itemImagePath } from '@/lib/itemCatalog';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Raça + classe do personagem ativo (opcionais). Filtram a vitrine para
  // mostrar só o que aquele personagem pode equipar (arma/peso por classe).
  const url = new URL(request.url);
  const race = url.searchParams.get('race');
  const charClass = url.searchParams.get('class');

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

      // Filtro pelo personagem ativo: exclusividade de raça + arma/peso por classe.
      if (race || charClass) {
        const check = canEquip(race, charClass, item.type as ItemTypeStr, stats.raceRestriction ?? null);
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
      image: resolveImageUrl(item.image) ?? (item.name ? itemImagePath(item.name) : null),
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
