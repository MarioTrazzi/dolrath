import { auth } from '@/app/api/auth/[...nextauth]/route'
import { requireApiActor } from '@/lib/botFleetAuth'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getLevelInfo } from '@/lib/experienceSystem'
import { regenAndPersist } from '@/lib/staminaServer'
import { Contract } from 'ethers'
import { getCharacterNftContractAddress, getCharacterNftProvider } from '@/lib/characterNftOnchain'
import { DOLRATH_CHARACTERS_ABI } from '@/lib/characterNftSigning'

function serializeBigInt(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString()
  // Date é `typeof object` com Object.entries === [] — sem o guard viraria `{}`.
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(serializeBigInt)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = serializeBigInt(v)
    return out
  }
  return value
}

function isNumericTokenId(value: string): boolean {
  return /^\d+$/.test(value)
}

export async function GET(
  req: Request,
  { params }: { params: { characterId: string } }
) {
  const resolved = await requireApiActor(req, params.characterId)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId
  const session = resolved.actor.isBot ? null : await auth()

  const characterIdOrTokenId = params.characterId

  try {
    const include = {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      equipment: {
        include: {
          item: true,
        },
      },
    } as const

    const character = await (async () => {
      if (isNumericTokenId(characterIdOrTokenId)) {
        const tokenId = BigInt(characterIdOrTokenId)

        // Security: ensure the session wallet owns this token on-chain.
        const walletAddress = String((session?.user as any)?.walletAddress || '').trim()
        if (!walletAddress) {
          return null
        }

        const contractAddress = getCharacterNftContractAddress()
        const provider = getCharacterNftProvider()
        const contract = new Contract(contractAddress, DOLRATH_CHARACTERS_ABI, provider)

        let owner: string
        try {
          owner = String(await contract.ownerOf(tokenId))
        } catch {
          return null
        }

        if (owner.toLowerCase() !== walletAddress.toLowerCase()) {
          return null
        }

        return prisma.character.findFirst({
          where: {
            userId,
            nftTokenId: tokenId,
          },
          include,
        })
      }

      return prisma.character.findUnique({
        where: { id: characterIdOrTokenId },
        include,
      })
    })()

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    if (character.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Remove sensitive user data before returning
    const { user, ...rawCharacterData } = character

    // Stamina viva sincronizada (regen passivo persistido ou, se o herói está
    // coletando, tiques da sessão debitados) + info da coleta p/ a UI da ficha.
    const characterData = await regenAndPersist(rawCharacterData)

    // Calculate XP information for next level
    const levelInfo = getLevelInfo(character.experience);
    const characterWithXPInfo = {
      ...characterData,
      level: levelInfo.level,
      nextLevelExperience: levelInfo.xpForNextLevel,
      currentLevelXP: levelInfo.xpForCurrentLevel,
      xpToNextLevel: levelInfo.xpToNextLevel,
      xpProgress: levelInfo.xpProgress,
      progressPercentage: levelInfo.progressPercentage
    };
    
    return NextResponse.json(serializeBigInt(characterWithXPInfo))
  } catch (error) {
    console.error('Error fetching character:', error)
    return NextResponse.json(
      { error: 'Failed to fetch character' },
      { status: 500 }
    )
  }
}

export async function PUT(
  req: Request,
  { params }: { params: { characterId: string } }
) {
  const resolved = await requireApiActor(req, params.characterId)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId

  const characterId = params.characterId

  try {
    const body = await req.json()
    const { hp, isAlive, deathTimestamp } = body

    // Verificar se o personagem existe e pertence ao usuário
    const character = await prisma.character.findUnique({
      where: { id: characterId },
    })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    if (character.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Atualizar o personagem
    const updatedCharacter = await prisma.character.update({
      where: { id: characterId },
      data: {
        ...(hp !== undefined && { hp }),
        ...(isAlive !== undefined && { isAlive }),
        ...(deathTimestamp !== undefined && { 
          deathTimestamp: deathTimestamp ? new Date(deathTimestamp) : null 
        }),
      },
    })

    console.log('✅ Personagem atualizado:', {
      id: updatedCharacter.id,
      name: updatedCharacter.name,
      hp: updatedCharacter.hp,
      isAlive: updatedCharacter.isAlive,
      deathTimestamp: updatedCharacter.deathTimestamp
    })

    return NextResponse.json({ success: true, character: updatedCharacter })
  } catch (error) {
    console.error('Error updating character:', error)
    return NextResponse.json(
      { error: 'Failed to update character' },
      { status: 500 }
    )
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { characterId: string } }
) {
  const resolved = await requireApiActor(req, params.characterId)
  if ('error' in resolved) return resolved.error
  const userId = resolved.actor.userId

  const characterId = params.characterId

  try {
    // First verify the character belongs to the user
    const character = await prisma.character.findUnique({
      where: { id: characterId },
      include: { user: true },
    })

    if (!character) {
      return NextResponse.json({ error: 'Character not found' }, { status: 404 })
    }

    if (character.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Delete the character
    await prisma.character.delete({
      where: { id: characterId },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting character:', error)
    return NextResponse.json(
      { error: 'Failed to delete character' },
      { status: 500 }
    )
  }
}
