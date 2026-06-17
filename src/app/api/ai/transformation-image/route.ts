/**
 * 🐉 Geração da arte de transformação a partir de uma imagem base (sem DB)
 * POST /api/ai/transformation-image
 *
 * Usado no fluxo de CRIAÇÃO: o personagem ainda não existe no banco, então o
 * client envia a imagem já escolhida (avatar/NFT) + a forma desejada e recebe a
 * arte da transformação para pré-visualizar e salvar junto na criação.
 *
 * Body: { baseImage: string (url|dataURL), transformationType: string }
 */

import { NextResponse } from 'next/server'
import { generateTransformationImage, TransformationGenError } from '@/lib/transformationImageGen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

type Body = {
  baseImage?: string
  transformationType?: string
}

export async function POST(req: Request) {
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

  try {
    const { image, prompt } = await generateTransformationImage({ baseImage, transformationType })
    return NextResponse.json({ image, transformationType, finalPrompt: prompt })
  } catch (error) {
    const status = error instanceof TransformationGenError ? 400 : 500
    const msg = error instanceof Error ? error.message : 'Erro ao gerar transformação'
    return NextResponse.json({ error: msg }, { status })
  }
}
