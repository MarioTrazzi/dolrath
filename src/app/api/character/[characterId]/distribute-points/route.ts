import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { recordAttributeDistribution } from '@/lib/characterHistory';

export async function POST(request: NextRequest, { params }: { params: { characterId: string } }) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { distributedPoints } = await request.json();
    
    if (!distributedPoints || typeof distributedPoints !== 'object') {
      return NextResponse.json({ error: 'Invalid points distribution' }, { status: 400 });
    }

    const characterId = params.characterId;
    
    // Verificar se o personagem pertence ao usuário
    const character = await prisma.character.findUnique({
      where: { id: characterId },
    });

    if (!character || character.userId !== session.user.id) {
      return NextResponse.json({ error: 'Character not found or unauthorized' }, { status: 404 });
    }

    // Extrair pontos distribuídos
    const str = Number(distributedPoints.str || 0);
    const agi = Number(distributedPoints.agi || 0);
    const int = Number(distributedPoints.int || 0);
    const res = Number(distributedPoints.res || 0);

    // Calcular total de pontos a serem gastos
    const totalPointsToSpend = str + agi + int + res;
    
    // Verificar se o personagem tem pontos suficientes
    const availablePoints = character.availablePoints || 0;
    if (totalPointsToSpend > availablePoints) {
      return NextResponse.json({ 
        error: `Pontos insuficientes! Você tem ${availablePoints} pontos, mas está tentando gastar ${totalPointsToSpend}.` 
      }, { status: 400 });
    }

    // Calcular novos stats baseados na distribuição
    const currentBaseStats = character.baseStats as any || {};
    const currentStr = (currentBaseStats.str || 0) + str;
    const currentAgi = (character.attributes as any)?.agi || 0; // Precisamos somar com o agi atual
    const currentInt = (character.attributes as any)?.int || 0;
    const currentRes = (currentBaseStats.res || 0) + res;

    // Recalcular stats derivados
    const newHp = character.maxHp + (str * 3) + (res * 2);
    const newMp = character.maxMp + (int * 4) + (agi * 1);
    const newStamina = character.maxStamina + (res * 5);

    // Atualizar personagem no banco
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        hp: newHp,
        maxHp: newHp,
        mp: newMp,
        maxMp: newMp,
        stamina: newStamina,
        maxStamina: newStamina,
        availablePoints: availablePoints - totalPointsToSpend,
        baseStats: {
          ...currentBaseStats,
          str: currentStr,
          res: currentRes,
          hp: newHp,
          maxHp: newHp,
          mp: newMp,
          maxMp: newMp,
          stamina: newStamina,
          maxStamina: newStamina,
        },
        attributes: {
          ...(character.attributes as any || {}),
          str: currentStr,
          agi: currentAgi + agi,
          int: currentInt + int,
          res: currentRes,
          crit: (currentAgi + agi) * 0.2,
          speed: (currentAgi + agi) * 0.5,
        }
      }
    });

    // Registrar no histórico
    try {
      await recordAttributeDistribution(characterId, distributedPoints);
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError);
      // Não falhar a operação por causa do histórico
    }

    return NextResponse.json({
      success: true,
      character: updatedCharacter,
      message: 'Pontos distribuídos com sucesso!'
    });
  } catch (error) {
    console.error('Error distributing points:', error);
    return NextResponse.json({ error: 'Error distributing points' }, { status: 500 });
  }
}
