/**
 * 🐉 Geração da arte de transformação a partir de uma imagem base (sem DB)
 * POST /api/ai/transformation-image
 *
 * Usado no fluxo de CRIAÇÃO: o personagem ainda não existe no banco, então o
 * client envia a imagem já escolhida (avatar/NFT) + a forma desejada e recebe a
 * arte da transformação para pré-visualizar e salvar junto na criação.
 *
 * A PRIMEIRA geração de cada forma está inclusa na taxa de criação. "Gerar de
 * novo" é uma regeração paga: o client transfere DOL para a tesouraria e envia
 * o txHash (uma transação = uma geração), podendo incluir ajustes no prompt.
 *
 * Body: {
 *   baseImage: string (url|dataURL),
 *   transformationType: string,
 *   classId?: string,            // mantém o traje da classe na forma transformada
 *   regen?: boolean,             // regeração paga
 *   modification?: string,       // ajustes do jogador (só na regeração)
 *   paymentTxHash?: string,      // obrigatório na regeração
 * }
 */

import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { generateTransformationImage, TransformationGenError } from '@/lib/transformationImageGen'
import { consumeAiGenPayment, releaseAiGenPayment, AiGenPaymentError } from '@/lib/aiGenPayment'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Body = {
  baseImage?: string
  transformationType?: string
  classId?: string
  regen?: boolean
  modification?: string
  paymentTxHash?: string
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: Body | null = null
  try {
    body = (await req.json()) as Body
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const baseImage = String(body?.baseImage || '').trim()
  const transformationType = String(body?.transformationType || '').trim()

  if (!baseImage) {
    return NextResponse.json({ error: 'baseImage é obrigatório' }, { status: 400 })
  }
  if (!transformationType) {
    return NextResponse.json({ error: 'transformationType é obrigatório' }, { status: 400 })
  }

  const paymentTxHash = String(body?.paymentTxHash || '')
  let paid = false

  try {
    if (body?.regen) {
      const walletAddress = (session.user.walletAddress || '').trim()
      if (!walletAddress) {
        return NextResponse.json({ error: 'Carteira não vinculada' }, { status: 403 })
      }
      await consumeAiGenPayment({
        userId: session.user.id,
        walletAddress,
        txHash: paymentTxHash,
        purpose: 'transformation-regen',
      })
      paid = true
    }

    const { image, prompt } = await generateTransformationImage({
      baseImage,
      transformationType,
      classId: body?.classId,
      modification: body?.regen ? body?.modification : undefined,
    })
    return NextResponse.json({ image, transformationType, finalPrompt: prompt })
  } catch (error) {
    // Falhou depois do pagamento consumido: libera o tx para nova tentativa.
    if (paid) await releaseAiGenPayment(paymentTxHash)
    const status =
      error instanceof AiGenPaymentError
        ? 402
        : error instanceof TransformationGenError
          ? 400
          : 500
    const msg = error instanceof Error ? error.message : 'Erro ao gerar transformação'
    return NextResponse.json({ error: msg }, { status })
  }
}
