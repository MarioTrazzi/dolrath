import { auth } from '@/app/api/auth/[...nextauth]/route';
import { prisma } from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';
import { recordAttributeDistribution } from '@/lib/characterHistory';
import { getRaceById, getClassById } from '@/lib/gameData';

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

    // 🔥 BUSCAR BÔNUS DE RAÇA E CLASSE
    const raceData = getRaceById(character.race);
    const classData = getClassById(character.class);
    
    if (!raceData || !classData) {
      return NextResponse.json({ error: 'Invalid character race or class' }, { status: 400 });
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

    // 🔥 CALCULAR BÔNUS RACIAIS E DE CLASSE (convertendo de 0-100 para 0-10)
    const raceStr = Math.floor((raceData.bonuses.strength || 0) / 10);
    const raceAgi = Math.floor((raceData.bonuses.dexterity || 0) / 10);  
    const raceInt = Math.floor((raceData.bonuses.intelligence || 0) / 10);
    const raceDef = Math.floor((raceData.bonuses.constitution || 0) / 10);
    
    const classStr = Math.floor((classData.bonuses.strength || 0) / 10);
    const classAgi = Math.floor((classData.bonuses.dexterity || 0) / 10);
    const classInt = Math.floor((classData.bonuses.intelligence || 0) / 10);
    const classDef = Math.floor((classData.bonuses.constitution || 0) / 10);

    // 🔥 STATS ATUAIS (do que já estava distribuído) + NOVOS PONTOS + BÔNUS
    const currentAttrs = character.attributes as any || {};
    const currentStr = (currentAttrs.distributedStr || 0) + addStr;
    const currentAgi = (currentAttrs.distributedAgi || 0) + addAgi;  
    const currentInt = (currentAttrs.distributedInt || 0) + addInt;
    const currentDef = (currentAttrs.distributedDef || 0) + addDef;

    // 🔥 STATS FINAIS = DISTRIBUIÇÃO + BÔNUS RACIAIS + BÔNUS DE CLASSE
    const finalStr = currentStr + raceStr + classStr;
    const finalAgi = currentAgi + raceAgi + classAgi;
    const finalInt = currentInt + raceInt + classInt;
    const finalDef = currentDef + raceDef + classDef;
    // 🔥 FÓRMULAS BALANCEADAS COM BÔNUS - Recalcular stats derivados
    const newHp = 80 + (finalStr * 2) + (finalDef * 4);              // DEF mais valioso
    const newMp = 60 + (finalInt * 3) + (finalAgi * 1);              // INT menos dominante  
    const newStamina = 120 + (finalAgi * 3);                         // AGI menos dominante
    
    // Novos stats derivados balanceados
    const newAttack = Math.floor(finalStr * 1.2);                    // STR menos dominante
    const newDefense = Math.floor(finalDef * 0.8);                   // DEF reduz dano real
    const newCritical = (finalAgi * 0.8) + 5;                        // AGI mais útil
    const newMagicPower = Math.floor(finalInt * 1.5);                // INT para magia
    const newDodgeChance = finalAgi * 0.3;                           // AGI para esquiva
    const newMagicResistance = Math.floor(finalInt * 0.4);           // INT para resistir magia

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
          // Stats distribuídos + bônus
          str: finalStr,
          agi: finalAgi,
          int: finalInt,
          def: finalDef,
          hp: newHp,
          maxHp: newHp,
          mp: newMp,
          maxMp: newMp,
          stamina: newStamina,
          maxStamina: newStamina,
          // Novos stats balanceados  
          attack: newAttack,
          defense: newDefense,
          critical: newCritical,
          magicPower: newMagicPower,
          dodgeChance: newDodgeChance,
          magicResistance: newMagicResistance,
          // Bônus aplicados para referência
          raceBonuses: {
            str: raceStr, agi: raceAgi, int: raceInt, def: raceDef,
            abilities: raceData.abilities
          },
          classBonuses: {
            str: classStr, agi: classAgi, int: classInt, def: classDef,
            abilities: classData.abilities
          }
        },
        attributes: {
          ...(character.attributes as any || {}),
          // Stats distribuídos pelo jogador (sem bônus)
          distributedStr: currentStr,
          distributedAgi: currentAgi,
          distributedInt: currentInt,
          distributedDef: currentDef,
          // Stats finais (com bônus)
          str: finalStr,
          agi: finalAgi,
          int: finalInt,
          def: finalDef,
          // Stats derivados
          crit: newCritical,
          speed: finalAgi * 0.5,
          magicResistance: newMagicResistance,
          dodgeChance: newDodgeChance,
          // Para compatibilidade com sistema antigo
          strength: finalStr,
          agility: finalAgi,
          intelligence: finalInt,
          defense: finalDef
        }
      }
    });

    // Log para debug
    console.log(`🔄 Pontos distribuídos para ${character.name}:`)
    console.log(`📊 Distribuído: +${addStr} STR, +${addAgi} AGI, +${addInt} INT, +${addDef} DEF`)
    console.log(`🔢 Stats finais: STR:${finalStr} AGI:${finalAgi} INT:${finalInt} DEF:${finalDef}`)
    console.log(`💖 HP:${newHp} 💙 MP:${newMp} ⚡ Stamina:${newStamina}`)

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
