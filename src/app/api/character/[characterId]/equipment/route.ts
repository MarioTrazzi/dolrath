import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function GET(
  req: Request,
  { params }: { params: { characterId: string } }
) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const character = await prisma.character.findUnique({
      where: { id: params.characterId },
      include: {
        equipment: {
          include: {
            item: true,
          },
        },
      },
    })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    if (character.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return NextResponse.json(character.equipment)
  } catch (error) {
    console.error('Error fetching character equipment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function POST(
  req: Request,
  { params }: { params: { characterId: string } }
) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { itemId, equipped } = await req.json()

    const character = await prisma.character.findUnique({
      where: { id: params.characterId },
      include: { equipment: true },
    })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    if (character.userId !== session.user.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const equipment = await prisma.characterEquipment.update({
      where: {
        id: itemId,
        characterId: params.characterId,
      },
      data: {
        equipped,
      },
      include: {
        item: true,
      },
    })

    return NextResponse.json(equipment)
  } catch (error) {
    console.error('Error updating character equipment:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
