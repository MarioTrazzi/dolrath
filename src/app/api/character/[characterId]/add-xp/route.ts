import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { addExperienceToCharacter } from '@/lib/characterLevelSystem';
import { recordXpGained } from '@/lib/characterHistory';

export async function POST(request: NextRequest, { params }: { params: { characterId: string } }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { xp } = await request.json();
    
    if (!xp || typeof xp !== 'number' || xp <= 0) {
      return NextResponse.json({ error: 'Invalid XP amount' }, { status: 400 });
    }

    const characterId = params.characterId;
    
    // Verificar se o personagem pertence ao usuário
    const character = await prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character || character.userId !== session.user.id) {
      return NextResponse.json({ error: 'Character not found or unauthorized' }, { status: 404 });
    }

    // Adicionar experiência
    const result = await addExperienceToCharacter(characterId, xp);

    // Registrar no histórico
    try {
      await recordXpGained(characterId, xp, 'manual');
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError);
      // Não falhar a operação por causa do histórico
    }

    return NextResponse.json({
      success: true,
      ...result,
      message: result.leveledUp 
        ? `Parabéns! Seu personagem subiu ${result.levelsGained} nível(is)!`
        : `Você ganhou ${xp} XP!`
    });
  } catch (error) {
    console.error('Error adding experience:', error);
    return NextResponse.json({ error: 'Error adding experience' }, { status: 500 });
  }
}
