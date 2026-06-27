import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'

export async function POST(
  req: Request,
  context: { params: { characterId: string } }
) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const { characterId } = context.params

  try {
    // Resetar stamina para o máximo
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        stamina: 100, // Resetar para stamina máxima
        staminaUpdatedAt: new Date(),
      }
    })

    return NextResponse.json({
      success: true,
      character: updatedCharacter,
      message: 'Stamina resetada para 100'
    })

  } catch (error) {
    console.error('Error resetting stamina:', error)
    return NextResponse.json(
      { error: 'Failed to reset stamina' },
      { status: 500 }
    )
  }
}
