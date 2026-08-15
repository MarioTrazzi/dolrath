import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { regenAndPersist } from '@/lib/staminaServer'
import { activateFoodBuff, foodBuffLabel, parseFoodBuffSpec } from '@/lib/foodBuff'
import { serializeBigInt } from '@/lib/serializeBigInt'
import { removeOneFromInventory } from '@/lib/inventoryMutations'

export async function POST(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id

  try {
    const { itemId, characterId } = await req.json()

    if (!itemId || !characterId) {
      return NextResponse.json(
        { error: 'Item ID and Character ID are required' },
        { status: 400 }
      )
    }

    // Verificar se o usuário possui o item no inventário global ou do personagem
    let userItem = await prisma.userInventory.findFirst({
      where: {
        userId: userId,
        itemId: itemId,
        quantity: {
          gt: 0
        }
      },
      include: {
        item: true
      }
    })

    let characterItem = null
    let isFromCharacterInventory = false
    let itemToUse: any = null

    if (!userItem) {
      // Tentar encontrar no inventário do personagem
      characterItem = await prisma.characterInventory.findFirst({
        where: {
          characterId: characterId,
          itemId: itemId,
          quantity: {
            gt: 0
          }
        },
        include: {
          item: true
        }
      })
      
      if (characterItem) {
        itemToUse = characterItem
        isFromCharacterInventory = true
      }
    } else {
      itemToUse = userItem
    }

    if (!itemToUse) {
      return NextResponse.json(
        { error: 'Você não possui este item' },
        { status: 404 }
      )
    }

    // Verificar se o item é consumível
    if (itemToUse.item.type !== 'CONSUMABLE') {
      return NextResponse.json(
        { error: 'Este item não pode ser usado' },
        { status: 400 }
      )
    }

    // Buscar o personagem
    const character = await prisma.character.findUnique({
      where: { id: characterId }
    })

    if (!character) {
      return NextResponse.json(
        { error: 'Personagem não encontrado' },
        { status: 404 }
      )
    }

    // Aplicar efeitos baseados no item
    let updateData: any = {}
    let effectMessage = ''

    // 🍳 COMIDA da Culinária — braço genérico pelos STATS (antes do switch por
    // nome, que só conhece as poções antigas).
    const itemStats = (itemToUse.item.stats ?? {}) as any
    const foodBuffSpec = parseFoodBuffSpec(itemStats)

    // Restauração instantânea DIRIGIDA PELO CATÁLOGO (itemCatalog.ts). Antes só
    // três nomes fixos tinham efeito aqui, com números chumbados que divergiam da
    // descrição do item (a Poção de Stamina diz "+20" e dava 50); todo o resto
    // caía no default e devolvia "Efeito do item não implementado".
    const healAmount = Number(itemStats.healAmount) || 0
    const manaAmount = Number(itemStats.manaAmount) || 0
    const staminaAmount = Number(itemStats.staminaAmount ?? itemStats.stamina_restore) || 0

    if (foodBuffSpec) {
      // Prato de buff: grava o buff ativo por TEMPO REAL (lib/foodBuff.ts).
      // Um prato por vez — comer outro substitui o anterior.
      const buff = activateFoodBuff(itemToUse.item.name, foodBuffSpec)
      updateData.activeFood = buff
      effectMessage = `Bem alimentado! ${foodBuffLabel(buff)} por ${foodBuffSpec.durationMin} min (${itemToUse.item.name})`
    } else if (healAmount > 0 || manaAmount > 0 || staminaAmount > 0) {
      const parts: string[] = []

      if (healAmount > 0) {
        const newHp = Math.min(character.maxHp, character.hp + healAmount)
        updateData.hp = newHp
        parts.push(`+${newHp - character.hp} HP (${newHp}/${character.maxHp})`)
      }

      if (manaAmount > 0) {
        const newMp = Math.min(character.maxMp, character.mp + manaAmount)
        updateData.mp = newMp
        parts.push(`+${newMp - character.mp} MP (${newMp}/${character.maxMp})`)
      }

      if (staminaAmount > 0) {
        // Soma sobre a stamina viva sincronizada (regen passivo ou, se coletando,
        // tiques da sessão já debitados) e reancora o regen.
        const liveStamina = (await regenAndPersist(character)).stamina
        const newStamina = Math.min(character.maxStamina, liveStamina + staminaAmount)
        updateData.stamina = newStamina
        updateData.staminaUpdatedAt = new Date()
        parts.push(`+${newStamina - liveStamina} Stamina (${newStamina}/${character.maxStamina})`)
      }

      effectMessage = `${itemToUse.item.name}: ${parts.join(' • ')}`
    } else switch (itemToUse.item.name.toLowerCase()) {
      // 🕰️ LEGADO: só alcança linhas antigas de Item sem `stats` no banco (as do
      // catálogo caem no braço acima). Não adicione casos novos aqui — o efeito
      // de item novo entra pelos stats do catálogo.
      case 'poção de stamina':
      case 'stamina potion':
        const staminaRestore = 50 // Restaura 50 stamina
        // Soma sobre a stamina viva sincronizada (regen passivo ou, se coletando,
        // tiques da sessão já debitados) e reancora o regen.
        const liveStamina = (await regenAndPersist(character)).stamina
        const newStamina = Math.min(character.maxStamina, liveStamina + staminaRestore)
        updateData.stamina = newStamina
        updateData.staminaUpdatedAt = new Date()
        effectMessage = `Stamina restaurada! +${newStamina - liveStamina} stamina (${newStamina}/${character.maxStamina})`
        break

      case 'poção de vida':
      case 'health potion':
        const healthRestore = 50 // Restaura 50 HP
        const newHp = Math.min(character.maxHp, character.hp + healthRestore)
        updateData.hp = newHp
        effectMessage = `Vida restaurada! +${newHp - character.hp} HP (${newHp}/${character.maxHp})`
        break

      case 'poção de mana':
      case 'mana potion':
        const manaRestore = 30 // Restaura 30 MP
        const newMp = Math.min(character.maxMp, character.mp + manaRestore)
        updateData.mp = newMp
        effectMessage = `Mana restaurada! +${newMp - character.mp} MP (${newMp}/${character.maxMp})`
        break

      default:
        return NextResponse.json(
          { error: 'Efeito do item não implementado' },
          { status: 400 }
        )
    }

    // Usar transação para garantir atomicidade
    const result = await prisma.$transaction(async (tx) => {
      // Baixa do item: a última unidade APAGA a linha. Decrementar até 0 deixava
      // uma linha fantasma — ela continuava aparecendo no inventário, ocupava
      // slot, e nenhuma ação (usar, transferir, mandar pro Baú Geral) a aceitava,
      // porque todas filtram quantity > 0.
      if (isFromCharacterInventory) {
        await removeOneFromInventory(tx, itemToUse.id)
      } else if (itemToUse.quantity > 1) {
        await tx.userInventory.update({
          where: { id: itemToUse.id },
          data: { quantity: { decrement: 1 } }
        })
      } else {
        await tx.userInventory.delete({ where: { id: itemToUse.id } })
      }

      // Aplicar efeitos no personagem
      const updatedCharacter = await tx.character.update({
        where: { id: characterId },
        data: updateData
      })

      return updatedCharacter
    })

    // serializeBigInt é obrigatório: Character tem colunas BigInt (nftTokenId,
    // marketListingId) e devolver a linha crua fazia o JSON.stringify estourar
    // DEPOIS do commit — o jogador via "Failed to use item" com a poção já gasta.
    return NextResponse.json({
      success: true,
      character: serializeBigInt(result),
      effect: effectMessage,
      itemUsed: itemToUse.item.name
    })

  } catch (error) {
    console.error('Error using item:', error)
    return NextResponse.json(
      { error: 'Failed to use item' },
      { status: 500 }
    )
  }
}
