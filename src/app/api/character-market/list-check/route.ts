import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { getDolContract, getDolTokenAddress } from '@/lib/dolOnchain'
import { getCharacterMarketChainId, getCharacterMarketContractAddress } from '@/lib/characterMarketOnchain'
import { getCharacterNftContractAddress } from '@/lib/characterNftOnchain'

export const dynamic = 'force-dynamic'

// Pré-checagem da venda de personagem: garante que o personagem é uma NFT,
// pertence ao usuário e está VAZIO (sem equipamento e sem inventário). O jogador
// precisa mandar todos os itens pro inventário global antes de listar.
// Devolve os dados on-chain (tokenId, contratos) para a carteira chamar
// approve + createListing(tokenId, priceDol). A garantia final fica no
// purchase-confirm, que sempre devolve qualquer item remanescente ao vendedor.
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id

  try {
    const { characterId } = await req.json()
    if (!characterId) {
      return NextResponse.json({ error: 'characterId é obrigatório' }, { status: 400 })
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    const walletAddress = String((user as any)?.walletAddress || '').trim()
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet required', requiresWallet: true }, { status: 403 })
    }

    const character = await prisma.character.findFirst({
      where: { id: characterId, userId },
    })
    if (!character) {
      return NextResponse.json({ error: 'Personagem não encontrado' }, { status: 404 })
    }
    if (character.nftTokenId == null) {
      return NextResponse.json(
        { error: 'Este personagem ainda não é uma NFT. Registre o personagem on-chain antes de vender.', requiresMint: true },
        { status: 409 }
      )
    }

    // O personagem precisa estar VAZIO (NFT "pelado": só nível/stats).
    const [equippedCount, inventoryCount] = await Promise.all([
      prisma.characterEquipment.count({ where: { characterId } }),
      prisma.characterInventory.count({ where: { characterId } }),
    ])
    if (equippedCount > 0 || inventoryCount > 0) {
      return NextResponse.json(
        {
          error:
            'Esvazie o personagem antes de vender: desequipe e mande todos os itens para o inventário global.',
          notEmpty: true,
          equippedCount,
          inventoryCount,
        },
        { status: 409 }
      )
    }

    const marketContractAddress = getCharacterMarketContractAddress()
    const characterNftContractAddress = getCharacterNftContractAddress()
    const dolTokenAddress = getDolTokenAddress()
    if (!marketContractAddress) {
      return NextResponse.json({ error: 'Missing CHARACTER_MARKET_CONTRACT_ADDRESS' }, { status: 500 })
    }
    if (!characterNftContractAddress) {
      return NextResponse.json({ error: 'Missing CHARACTER_NFT_CONTRACT_ADDRESS' }, { status: 500 })
    }
    if (!dolTokenAddress) {
      return NextResponse.json({ error: 'Missing DOL_TOKEN_ADDRESS' }, { status: 500 })
    }

    const dol = getDolContract()
    const [decimals, symbol] = await Promise.all([dol.decimals(), dol.symbol()])

    return NextResponse.json({
      ok: true,
      chainId: getCharacterMarketChainId(),
      marketContractAddress,
      characterNftContractAddress,
      dolTokenAddress,
      dol: { decimals: Number(decimals), symbol: String(symbol) },
      tokenId: character.nftTokenId.toString(),
      to: walletAddress,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to check character listing'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
