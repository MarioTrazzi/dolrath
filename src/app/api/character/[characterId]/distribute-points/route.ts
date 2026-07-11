import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { recordAttributeDistribution } from '@/lib/characterHistory';
import { buildAttributeUpdate } from '@/lib/attributeRecalc';

function serializeBigIntForJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  ) as T
}

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

    // Extrair pontos distribuídos NESTA atualização
    // UI historically uses `res` while the backend uses `def`.
    const addStr = Number((distributedPoints as any).str || 0);
    const addAgi = Number((distributedPoints as any).agi || 0);
    const addInt = Number((distributedPoints as any).int || 0);
    const addDef = Number((distributedPoints as any).def ?? (distributedPoints as any).res ?? 0);

    const values = [addStr, addAgi, addInt, addDef];
    const allInts = values.every((v) => Number.isFinite(v) && Number.isInteger(v));
    const allNonNegative = values.every((v) => v >= 0);
    if (!allInts || !allNonNegative) {
      return NextResponse.json({ error: 'Invalid points values' }, { status: 400 });
    }

    // Calcular total de pontos a serem gastos
    const totalPointsToSpend = addStr + addAgi + addInt + addDef;

    if (totalPointsToSpend <= 0) {
      return NextResponse.json({ error: 'Você precisa distribuir pelo menos 1 ponto.' }, { status: 400 });
    }
    
    // Verificar se o personagem tem pontos suficientes
    const availablePoints = character.availablePoints || 0;
    if (totalPointsToSpend > availablePoints) {
      return NextResponse.json({ 
        error: `Pontos insuficientes! Você tem ${availablePoints} pontos, mas está tentando gastar ${totalPointsToSpend}.` 
      }, { status: 400 });
    }

    // 🔢 Recálculo compartilhado (attributeRecalc.ts) — mesmo miolo usado pela
    // rota skill-tree/spend nos nós de stat da árvore.
    let recalc;
    try {
      recalc = buildAttributeUpdate(character, { str: addStr, agi: addAgi, int: addInt, def: addDef });
    } catch {
      return NextResponse.json({ error: 'Invalid character race or class' }, { status: 400 });
    }

    // Atualizar personagem no banco
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        ...recalc.data,
        availablePoints: availablePoints - totalPointsToSpend,
      }
    });

    // Log para debug
    const { finals, data } = recalc;
    console.log(`🔄 Pontos distribuídos para ${character.name}:`)
    console.log(`📊 Distribuído: +${addStr} STR, +${addAgi} AGI, +${addInt} INT, +${addDef} DEF`)
    console.log(`🔢 Stats finais: STR:${finals.str} AGI:${finals.agi} INT:${finals.int} DEF:${finals.def}`)
    console.log(`💖 HP:${data.hp} 💙 MP:${data.mp} ⚡ Stamina:${data.maxStamina}`)

    // Registrar no histórico
    try {
      await recordAttributeDistribution(characterId, distributedPoints);
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError);
      // Não falhar a operação por causa do histórico
    }

    return NextResponse.json({
      success: true,
      character: serializeBigIntForJson(updatedCharacter),
      message: 'Pontos distribuídos com sucesso!'
    });
  } catch (error) {
    console.error('Error distributing points:', error);
    return NextResponse.json({ error: 'Error distributing points' }, { status: 500 });
  }
}
