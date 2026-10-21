import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { getCharacterHistory } from '@/lib/characterHistory';
import { prisma } from '@/lib/prisma';
import { getT } from '@/lib/i18n/server'

export async function GET(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  const t = getT()
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: t('Not authenticated') }, { status: 401 });
    }

    // Histórico é privado: gold, XP, itens e detalhes de cada ação do herói. Só o
    // dono lê (antes qualquer conta logada lia o de qualquer herói pelo id).
    const owned = await prisma.character.findFirst({
      where: { id: params.characterId, userId: session.user.id },
      select: { id: true },
    });
    if (!owned) {
      return NextResponse.json({ error: t('Character not found') }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50') || 50));

    const history = await getCharacterHistory(params.characterId, limit);

    return NextResponse.json(history);
  } catch (error) {
    console.error('Erro ao buscar histórico:', error);
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    );
  }
}
