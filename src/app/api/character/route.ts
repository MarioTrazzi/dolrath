import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { recordCharacterCreated } from '@/lib/characterHistory'
import { RACES, CLASSES, getRaceById, getClassById } from '@/lib/gameData'

export async function POST(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Verify user exists in the database
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }


  const { name, race, characterClass: class_, distributedPoints, image: avatar } = await req.json()

  if (!name || !race || !class_) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    // 🔥 BUSCAR DADOS DE RAÇA E CLASSE PARA APLICAR BÔNUS
    const raceData = getRaceById(race)
    const classData = getClassById(class_)
    
    if (!raceData || !classData) {
      return NextResponse.json({ error: 'Invalid race or class' }, { status: 400 })
    }

    // Validar e extrair os valores dos atributos distribuídos pelo jogador
    const distributedStr = Number(distributedPoints?.str || 0)
    const distributedAgi = Number(distributedPoints?.agi || 0)
    const distributedInt = Number(distributedPoints?.int || 0)
    const distributedDef = Number(distributedPoints?.def || 0)

    // 🔥 APLICAR BÔNUS RACIAIS E DE CLASSE
    // Stats base (conversão do sistema antigo para o novo balanceado)
    const raceStr = Math.floor((raceData.bonuses.strength || 0) / 10)  // Converter de 0-100 para 0-10
    const raceAgi = Math.floor((raceData.bonuses.dexterity || 0) / 10)
    const raceInt = Math.floor((raceData.bonuses.intelligence || 0) / 10)  
    const raceDef = Math.floor((raceData.bonuses.constitution || 0) / 10)
    
    const classStr = Math.floor((classData.bonuses.strength || 0) / 10)
    const classAgi = Math.floor((classData.bonuses.dexterity || 0) / 10)
    const classInt = Math.floor((classData.bonuses.intelligence || 0) / 10)
    const classDef = Math.floor((classData.bonuses.constitution || 0) / 10)

    // 🔥 STATS FINAIS = DISTRIBUIÇÃO + BÔNUS RACIAL + BÔNUS DE CLASSE
    const finalStr = distributedStr + raceStr + classStr
    const finalAgi = distributedAgi + raceAgi + classAgi  
    const finalInt = distributedInt + raceInt + classInt
    const finalDef = distributedDef + raceDef + classDef

    // 🔥 FÓRMULAS BALANCEADAS COM BÔNUS - Todos os stats são úteis
    const baseHp = 80 + (finalStr * 2) + (finalDef * 4)    // DEF mais valioso para HP
    const baseMp = 60 + (finalInt * 3) + (finalAgi * 1)    // INT menos dominante
    const baseStamina = 120 + (finalAgi * 3)               // AGI menos dominante

    const baseStats = {
      hp: baseHp,
      maxHp: baseHp,
      mp: baseMp,
      maxMp: baseMp,
      stamina: baseStamina,
      maxStamina: baseStamina,
      str: finalStr,
      agi: finalAgi,
      int: finalInt,
      def: finalDef,
      // Novos stats calculados com valores finais
      attack: Math.floor(finalStr * 1.2),                     // STR menos dominante
      defense: Math.floor(finalDef * 0.8),                    // DEF reduz dano real
      critical: (finalAgi * 0.8) + 5,                         // AGI mais útil para crit
      magicPower: Math.floor(finalInt * 1.5),                 // INT para ataques mágicos
      dodgeChance: finalAgi * 0.3,                            // AGI para esquiva
      magicResistance: Math.floor(finalInt * 0.4),            // INT para resistir magia
      // Bônus aplicados para referência
      raceBonuses: {
        str: raceStr, agi: raceAgi, int: raceInt, def: raceDef,
        abilities: raceData.abilities
      },
      classBonuses: {
        str: classStr, agi: classAgi, int: classInt, def: classDef,
        abilities: classData.abilities
      }
    };

    const attributes = distributedPoints ? {
      // Stats distribuídos pelo jogador
      distributedStr, distributedAgi, distributedInt, distributedDef,
      // Stats finais (com bônus)
      str: finalStr, agi: finalAgi, int: finalInt, def: finalDef,
      // Stats derivados
      crit: (finalAgi * 0.8) + 5,                             // 5% base + AGI
      speed: finalAgi * 0.5,
      magicResistance: (finalInt * 0.2) + (finalDef * 0.1),   // INT e DEF protegem de magia
      // Transformação disponível
      canTransform: raceData.transformationAvailable
    } : {};

    const character = await prisma.character.create({
      data: {
        name,
        race,
        class: class_,
        avatar: avatar,
        level: 1,
        experience: 0,
        // Stats calculados baseados na distribuição + bônus raciais/classe
        hp: baseHp,
        maxHp: baseHp,
        mp: baseMp,
        maxMp: baseMp,
        stamina: baseStamina,
        maxStamina: baseStamina,
        baseStats: baseStats,
        attributes: {
          ...attributes,
          // Adicionar informações de transformação para raças que podem
          isTransformed: false,
          transformationType: null,
          transformationData: null,
          
          // Dados das habilidades para referência
          raceAbilities: raceData.abilities,
          classAbilities: classData.abilities,
          
          // Strength/Agility/Intelligence/Defense finais para o novo sistema
          strength: finalStr,
          agility: finalAgi, 
          intelligence: finalInt,
          defense: finalDef
        },
        gold: 0,
        user: {
          connect: {
            id: session.user.id,
          },
        },
      },
    })

    // Log de criação para debug
    console.log(`🎯 Personagem criado com bônus:`)
    console.log(`📊 Raça ${race}:`, raceData.bonuses)
    console.log(`⚔️ Classe ${class_}:`, classData.bonuses)
    console.log(`🔢 Stats finais: STR:${finalStr} AGI:${finalAgi} INT:${finalInt} DEF:${finalDef}`)
    console.log(`💖 HP:${baseHp} 💙 MP:${baseMp} ⚡ Stamina:${baseStamina}`)

    // Registrar no histórico
    try {
      await recordCharacterCreated(character.id, name, race, class_);
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError);
      // Não falhar a operação por causa do histórico
    }

    return NextResponse.json(character)
  } catch (error) {
    console.error('Error creating character:', error)
    let errorMessage = 'Error creating character'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const characters = await prisma.character.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(characters)
  } catch (error) {
    console.error('Error fetching characters:', error)
    return NextResponse.json({ error: 'Error fetching characters' }, { status: 500 })
  }
}
