import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getLevelInfo } from '@/lib/experienceSystem';

export async function POST() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Buscar todos os personagens do usuário
    const characters = await prisma.character.findMany({
      where: { userId: session.user.id },
    });

    const updates = [];

    // Atualizar cada personagem
    for (const character of characters) {
      const levelInfo = getLevelInfo(character.experience);
      
      if (levelInfo.level !== character.level) {
        // Atualizar o nível no banco
        await prisma.character.update({
          where: { id: character.id },
          data: { level: levelInfo.level },
        });

        updates.push({
          id: character.id,
          name: character.name,
          oldLevel: character.level,
          newLevel: levelInfo.level,
          experience: character.experience,
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: `Sincronizados ${characters.length} personagens`,
      updates,
      updatedCount: updates.length,
    });
  } catch (error) {
    console.error('Error syncing character levels:', error);
    return NextResponse.json({ error: 'Error syncing character levels' }, { status: 500 });
  }
}
