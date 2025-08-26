import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const item = await prisma.item.findUnique({
      where: {
        id: params.id,
      },
    });

    if (!item) {
      return NextResponse.json({ error: 'Item not found' }, { status: 404 });
    }

    // TODO: Adicionar lore aos itens no futuro
    // Por enquanto, vamos adicionar uma lore fake para alguns tipos de itens
    const fakeLore: { [key: string]: string } = {
      WEAPON: 'Esta arma foi forjada nas profundezas das Montanhas de Fogo por mestres ferreiros anões. Dizem que seu poder é capaz de partir rochas ao meio.',
      ARMOR: 'Uma armadura lendária que já protegeu incontáveis heróis em suas jornadas. As marcas de batalha em sua superfície contam histórias de vitórias gloriosas.',
      HELMET: 'Criado por artesãos élficos, este elmo combina proteção com elegância. Seus detalhes intrincados revelam padrões que brilham sob a luz do luar.',
      SHIELD: 'Este escudo pertenceu a uma antiga ordem de cavaleiros que protegia os reinos dos homens. Sua resistência é tão lendária quanto sua história.',
    };

    // Adiciona a lore se existir para o tipo do item
    const itemWithLore = {
      ...item,
      lore: fakeLore[item.type] || undefined,
    };

    return NextResponse.json(itemWithLore);
  } catch (error) {
    console.error('Error fetching item:', error);
    return NextResponse.json(
      { error: 'Failed to fetch item' },
      { status: 500 }
    );
  }
}
