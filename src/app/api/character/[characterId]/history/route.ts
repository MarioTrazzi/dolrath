import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';
import { getCharacterHistory } from '@/lib/characterHistory';
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

    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');

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
