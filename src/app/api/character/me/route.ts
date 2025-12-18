import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getLevelInfo } from '@/lib/experienceSystem';

function serializeBigInt(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(serializeBigInt);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serializeBigInt(v);
    return out;
  }
  return value;
}

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
      return NextResponse.json([]);
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

    return NextResponse.json(serializeBigInt(processedCharacters));
  } catch (error) {
    console.error('Error fetching character:', error);
    return NextResponse.json({ error: 'Error fetching character' }, { status: 500 });
  }
}
