import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { recordCharacterCreated } from '@/lib/characterHistory'

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
    // Validar e extrair os valores dos atributos
    const str = Number(distributedPoints?.str || 0)
    const agi = Number(distributedPoints?.agi || 0)
    const int = Number(distributedPoints?.int || 0)
    const def = Number(distributedPoints?.def || 0)

    // Calcular atributos derivados
    const baseHp = 100 + (str * 3) + (def * 2)
    const baseMp = 50 + (int * 4) + (agi * 1)
    const baseStamina = 100 + (agi * 5)

    const baseStats = {
      hp: baseHp,
      maxHp: baseHp,
      mp: baseMp,
      maxMp: baseMp,
      stamina: baseStamina,
      maxStamina: baseStamina,
      str,
      def
    };

    const attributes = distributedPoints ? {
      str, agi, int, def,
      crit: agi * 0.2,
      speed: agi * 0.5
    } : {};

    const character = await prisma.character.create({
      data: {
        name,
        race,
        class: class_,
        avatar: avatar,
        level: 1,
        experience: 0,
        // Stats calculados baseados na distribuição de pontos
        hp: baseHp,
        maxHp: baseHp,
        mp: baseMp,
        maxMp: baseMp,
        stamina: baseStamina,
        maxStamina: baseStamina,
        baseStats: baseStats,
        attributes: attributes,
        gold: 0,
        user: {
          connect: {
            id: session.user.id,
          },
        },
      },
    })

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
