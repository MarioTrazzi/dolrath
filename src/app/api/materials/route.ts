// API para gerenciar materiais do jogador

import { NextRequest, NextResponse } from 'next/server'
import { materialSystem } from '@/lib/materialSystem'
import { MATERIALS, getMaterialById } from '@/lib/dungeonData'

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams
    const characterId = searchParams.get('characterId')
    const action = searchParams.get('action')
    
    if (!characterId) {
      return NextResponse.json(
        { error: 'CharacterId é obrigatório' },
        { status: 400 }
      )
    }
    
    switch (action) {
      case 'inventory':
        // Obter inventário de materiais
        const materials = materialSystem.getCharacterMaterials(characterId)
        const stats = materialSystem.getInventoryStats(characterId)
        const valuable = materialSystem.getMostValuableMaterials(characterId)
        
        return NextResponse.json({
          materials,
          stats,
          mostValuable: valuable
        })
      
      case 'recipes':
        // Obter receitas de crafting disponíveis
        // Precisamos de dados do personagem para isso
        return NextResponse.json({
          error: 'Dados do personagem necessários para receitas'
        }, { status: 400 })
        
      case 'transactions':
        // Obter histórico de transações
        const transactions = materialSystem.getTransactionHistory(characterId)
        return NextResponse.json({
          transactions
        })
        
      case 'suggestions':
        // Sugestões de materiais para vender
        const suggestions = materialSystem.suggestMaterialsToSell(characterId)
        return NextResponse.json({
          suggestions
        })
        
      default:
        // Listar todos os materiais disponíveis
        return NextResponse.json({
          allMaterials: MATERIALS,
          total: MATERIALS.length
        })
    }
    
  } catch (error) {
    console.error('Erro ao buscar materiais:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { action, characterId, characterData, ...data } = await request.json()
    
    if (!characterId) {
      return NextResponse.json(
        { error: 'CharacterId é obrigatório' },
        { status: 400 }
      )
    }
    
    switch (action) {
      case 'craft':
        // Executar crafting
        const { recipeId, characterTokens } = data
        
        if (!recipeId || typeof characterTokens !== 'number') {
          return NextResponse.json(
            { error: 'RecipeId e characterTokens são obrigatórios' },
            { status: 400 }
          )
        }
        
        const craftResult = materialSystem.craftItem(characterId, recipeId, characterTokens)
        
        return NextResponse.json({
          success: craftResult.success,
          result: craftResult,
          message: craftResult.message
        })
        
      case 'sell':
        // Vender materiais
        const { offers } = data
        
        if (!offers || !Array.isArray(offers)) {
          return NextResponse.json(
            { error: 'Offers deve ser um array' },
            { status: 400 }
          )
        }
        
        const tokensEarned = materialSystem.sellMaterials(characterId, offers)
        
        return NextResponse.json({
          success: true,
          tokensEarned,
          message: `Você vendeu materiais e ganhou ${tokensEarned} tokens!`
        })
        
      case 'buy':
        // Comprar materiais
        const { buyOffers, characterTokens: tokens } = data
        
        if (!buyOffers || !Array.isArray(buyOffers) || typeof tokens !== 'number') {
          return NextResponse.json(
            { error: 'buyOffers e characterTokens são obrigatórios' },
            { status: 400 }
          )
        }
        
        const buySuccess = materialSystem.buyMaterials(characterId, buyOffers, tokens)
        
        if (buySuccess) {
          const totalCost = buyOffers.reduce((sum: number, offer: any) => sum + offer.totalPrice, 0)
          return NextResponse.json({
            success: true,
            tokensSpent: totalCost,
            message: `Você comprou materiais por ${totalCost} tokens!`
          })
        } else {
          return NextResponse.json({
            success: false,
            message: 'Tokens insuficientes para comprar os materiais'
          })
        }
        
      case 'get_recipes':
        // Obter receitas disponíveis para o personagem
        if (!characterData) {
          return NextResponse.json(
            { error: 'CharacterData é obrigatório para obter receitas' },
            { status: 400 }
          )
        }
        
        const recipes = materialSystem.getAvailableRecipes(characterData)
        const recipesWithAvailability = recipes.map(recipe => ({
          ...recipe,
          canCraft: materialSystem.canCraft(characterId, recipe.id),
          missingMaterials: recipe.materials.filter(req => 
            !materialSystem.hasEnoughMaterial(characterId, req.materialId, req.quantity)
          )
        }))
        
        return NextResponse.json({
          recipes: recipesWithAvailability,
          total: recipes.length
        })
        
      default:
        return NextResponse.json(
          { error: 'Ação não reconhecida' },
          { status: 400 }
        )
    }
    
  } catch (error) {
    console.error('Erro ao processar ação de materiais:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
} 