import { NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { signMintRequest } from '@/lib/characterNftSigning'
import { getCharacterNftChainId, getCharacterNftContractAddress } from '@/lib/characterNftOnchain'
import { buildCharacterNftTokenUri } from '@/lib/characterNftMetadata'
import { getLevelInfo } from '@/lib/experienceSystem'
import crypto from 'node:crypto'

// Re-mint da NFT de um personagem que JÁ existe no banco (sem pagamento em DOL —
// isso não é criação de personagem novo, é reemitir o token pra um char existente,
// ex.: depois de um reset de banco que perdeu o nftTokenId antigo).
//
// A tokenURI aqui é um data-URI estático (JSON embutido) com nome/raça/classe/
// stats/avatar/imagem de transformação já dentro — não depende do servidor/banco
// pra resolver a metadata depois (ver dolrath-db-access na memória do projeto).
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const to = (session.user as any)?.walletAddress?.trim?.() || ''
    if (!to) {
      return NextResponse.json({ error: 'Wallet required', requiresWallet: true }, { status: 403 })
    }

    const body = (await req.json().catch(() => null)) as any
    const characterId = (body?.characterId || '').toString().trim()
    if (!characterId) {
      return NextResponse.json({ error: 'Missing characterId' }, { status: 400 })
    }

    const character = await prisma.character.findUnique({ where: { id: characterId } })
    if (!character || character.userId !== session.user.id) {
      return NextResponse.json({ error: 'Character not found or unauthorized' }, { status: 404 })
    }

    const contractAddress = getCharacterNftContractAddress()
    if (!contractAddress) {
      return NextResponse.json({ error: 'Server missing CHARACTER_NFT_CONTRACT_ADDRESS' }, { status: 500 })
    }
    const chainId = getCharacterNftChainId()

    const attrs = (character.attributes as any) || {}
    const baseStats = (character.baseStats as any) || {}
    const stats = {
      str: Number(attrs.str ?? baseStats.str ?? 0),
      agi: Number(attrs.agi ?? baseStats.agi ?? 0),
      int: Number(attrs.int ?? baseStats.int ?? 0),
      def: Number(attrs.def ?? baseStats.def ?? 0),
    }

    const level = getLevelInfo(character.experience).level || character.level || 1
    const mintNonce = crypto.randomUUID()

    const { tokenURI } = buildCharacterNftTokenUri({
      name: character.name,
      raceId: character.race,
      classId: character.class,
      avatarUrl: character.avatar,
      transformationImageUrl: character.transformationImage,
      stats,
      level,
      mintNonce,
    })

    const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 60)
    const signed = await signMintRequest({ to, tokenURI, deadline })

    return NextResponse.json({
      characterId: character.id,
      contractAddress,
      chainId,
      to,
      tokenURI,
      deadline: deadline.toString(),
      signature: signed.signature,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
