/**
 * 🐉 Geração da imagem de transformação de um personagem
 * POST /api/character/[characterId]/generate-transformation
 *
 * Usa o avatar (NFT) já escolhido como referência e gera, via gpt-image-1, a arte
 * da forma transformada. Idempotente: se já existir imagem para a forma travada,
 * retorna a existente sem gastar uma nova geração.
 *
 * Body (opcional): { transformationType?: string }
 *  - Metamorfo: precisa informar a forma escolhida (wolf|bear|eagle).
 *  - Demais raças: usa a única forma da raça automaticamente.
 */

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { getRaceTransformations, TransformationType } from '@/lib/transformationSystem'
import { generateTransformationImage, TransformationGenError } from '@/lib/transformationImageGen'
import { getT } from '@/lib/i18n/server'
import { rateLimitAllow, rateLimited429 } from '@/lib/rateLimit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(
  req: NextRequest,
  { params }: { params: { characterId: string } }
) {
  const t = getT()
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { characterId } = params
  if (!characterId) {
    return NextResponse.json({ error: t('Character ID is required') }, { status: 400 })
  }

  const body = (await req.json().catch(() => ({}))) as { transformationType?: string }

  const character = await prisma.character.findUnique({ where: { id: characterId } })
  if (!character) {
    return NextResponse.json({ error: t('Character not found') }, { status: 404 })
  }
  if (character.userId !== session.user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const raceForms = getRaceTransformations(character.race)
  if (raceForms.length === 0) {
    return NextResponse.json(
      { error: t('This race has no transformation') },
      { status: 400 }
    )
  }

  // Decide a forma: corpo > forma já travada > única forma da raça.
  const requested = String(body?.transformationType || '').toLowerCase() as TransformationType
  const locked = (character.unlockedTransformation || '') as TransformationType
  let transformationType: TransformationType | '' =
    (requested && raceForms.includes(requested) && requested) ||
    (locked && raceForms.includes(locked) && locked) ||
    (raceForms.length === 1 ? raceForms[0] : '')

  if (!transformationType) {
    return NextResponse.json(
      {
        error: t('Choose a transformation form'),
        availableForms: raceForms,
      },
      { status: 400 }
    )
  }

  // Idempotência POR FORMA: cada forma é gerada uma vez só. Antes a checagem
  // olhava só a forma travada — alternar lobo/urso/lobo… gerava uma imagem nova
  // (paga para nós) a cada chamada, de graça para o jogador, contornando a
  // regeração paga (/api/ai/transformation-image).
  const imagesByForm = ((character.transformationImages && typeof character.transformationImages === 'object')
    ? character.transformationImages
    : {}) as Record<string, string>
  const existingForForm =
    imagesByForm[transformationType] ||
    (character.unlockedTransformation === transformationType ? character.transformationImage : null)
  if (existingForForm) {
    // Trocar para uma forma que já tem arte só aponta para ela — sem gerar.
    if (character.unlockedTransformation !== transformationType || character.transformationImage !== existingForForm) {
      await prisma.character.update({
        where: { id: characterId },
        data: { unlockedTransformation: transformationType, transformationImage: existingForForm },
      })
    }
    return NextResponse.json({
      success: true,
      alreadyExisted: true,
      transformationType,
      transformationImage: existingForForm,
    })
  }

  // Geração de verdade custa dinheiro: teto por usuário.
  if (!rateLimitAllow(`gen-transformation:${session.user.id}`, { windowMs: 60 * 60_000, max: 6 })) {
    return rateLimited429()
  }

  const baseImage = character.avatar
  if (!baseImage) {
    return NextResponse.json(
      { error: t('Character has no base image (avatar) to generate the transformation') },
      { status: 400 }
    )
  }

  try {
    const { image } = await generateTransformationImage({
      baseImage,
      transformationType,
      classId: character.class,
    })

    const updated = await prisma.character.update({
      where: { id: characterId },
      data: {
        unlockedTransformation: transformationType,
        transformationImage: image,
        transformationImages: { ...imagesByForm, [transformationType]: image },
      },
      select: { id: true, unlockedTransformation: true, transformationImage: true },
    })

    return NextResponse.json({
      success: true,
      transformationType: updated.unlockedTransformation,
      transformationImage: updated.transformationImage,
    })
  } catch (error) {
    const msg =
      error instanceof TransformationGenError
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Erro ao gerar transformação'
    console.error('Erro ao gerar transformação:', error)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
