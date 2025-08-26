import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getLevelInfo } from '@/lib/experienceSystem';
import { getRaceById, getClassById } from '@/lib/gameData';

export async function GET() {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const characters = await prisma.character.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    });

    if (!characters || characters.length === 0) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 });
    }

    // Processar cada personagem para calcular nível correto e usar stats reais do banco
    const processedCharacters = characters.map(character => {
      // Calcular nível e XP baseado na experiência total
      const levelInfo = getLevelInfo(character.experience);
      
      // Usar os stats reais salvos no banco de dados em vez de recalcular
      const baseStats = character.baseStats as any || {};
      
      return {
        ...character,
        level: levelInfo.level,
        levelInfo, // Informações completas de progressão
        // Usar dados reais do banco em vez de recalculados
        hp: character.hp || baseStats.hp || 100,
        maxHp: character.maxHp || baseStats.maxHp || 100,
        mp: character.mp || baseStats.mp || 50,
        maxMp: character.maxMp || baseStats.maxMp || 50,
        stamina: character.stamina || baseStats.stamina || 100,
        maxStamina: character.maxStamina || baseStats.maxStamina || 100,
      };
    });

    return NextResponse.json(processedCharacters);
  } catch (error) {
    console.error('Error fetching character:', error);
    return NextResponse.json({ error: 'Error fetching character' }, { status: 500 });
  }
}
