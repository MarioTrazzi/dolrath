import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextResponse } from 'next/server';
import { getLevelInfo } from '@/lib/experienceSystem';
import { regenAndPersist } from '@/lib/staminaServer';

function serializeBigInt(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  // Date é `typeof object`, mas Object.entries(date) === [] — sem este guard,
  // o ramo genérico abaixo o transforma em `{}`, e no cliente `new Date({})`
  // vira Invalid Date → NaN (ex.: staminaUpdatedAt no regen passivo).
  if (value instanceof Date) return value.toISOString();
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
    const rawCharacters = await prisma.character.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'asc' },
    });

    if (!rawCharacters || rawCharacters.length === 0) {
      return NextResponse.json([]);
    }

    // Aplica o regen passivo (e persiste) antes de servir: a stamina mostrada
    // nasce viva e a âncora fica em dia para os próximos cálculos.
    const characters = await Promise.all(rawCharacters.map(regenAndPersist));

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
