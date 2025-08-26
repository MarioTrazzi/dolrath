// Sistema de materiais do Dolrath RPG

import { 
  Material, 
  CharacterMaterial, 
  Character, 
  DungeonLoot, 
  Rarity, 
  MaterialType, 
  MaterialUse, 
  Weapon, 
  Armor,
  WeaponType,
  ArmorType,
  DiceType,
  RewardType
} from '@/types/game'

import { 
  MATERIALS, 
  getMaterialById, 
  getMaterialsByRarity, 
  getMaterialsByType 
} from '@/lib/dungeonData'

import { v4 as uuidv4 } from 'uuid'

export interface CraftingRecipe {
  id: string
  name: string
  description: string
  resultType: 'weapon' | 'armor' | 'enhancement'
  resultItem?: Weapon | Armor
  materials: MaterialRequirement[]
  levelRequired: number
  cost: number // em tokens
  successRate: number
  rarity: Rarity
}

export interface MaterialRequirement {
  materialId: string
  quantity: number
  rarity?: Rarity
}

export interface CraftingResult {
  success: boolean
  item?: Weapon | Armor
  materialsUsed: MaterialRequirement[]
  tokensSpent: number
  message: string
}

export interface TradeOffer {
  materialId: string
  quantity: number
  pricePerUnit: number
  totalPrice: number
}

export interface MaterialTransaction {
  id: string
  characterId: string
  type: 'buy' | 'sell' | 'craft' | 'found'
  materialId: string
  quantity: number
  tokensExchanged: number
  timestamp: Date
}

export class MaterialSystem {
  private characterMaterials: Map<string, CharacterMaterial[]> = new Map()
  private transactions: MaterialTransaction[] = []

  // === GESTÃO DE INVENTÁRIO ===

  // Adicionar materiais ao inventário
  addMaterials(characterId: string, materials: DungeonLoot[]): void {
    let characterInventory = this.characterMaterials.get(characterId) || []
    
    for (const loot of materials) {
      if (loot.type === RewardType.MATERIAL) {
        const material = getMaterialById(loot.name.toLowerCase().replace(/\s+/g, '_'))
        if (material) {
          const existingMaterial = characterInventory.find(cm => cm.materialId === material.id)
          
          if (existingMaterial) {
            existingMaterial.quantity += loot.quantity
            existingMaterial.lastUpdated = new Date()
          } else {
            characterInventory.push({
              id: uuidv4(),
              characterId,
              materialId: material.id,
              quantity: loot.quantity,
              lastUpdated: new Date()
            })
          }
          
          // Registrar transação
          this.transactions.push({
            id: uuidv4(),
            characterId,
            type: 'found',
            materialId: material.id,
            quantity: loot.quantity,
            tokensExchanged: 0,
            timestamp: new Date()
          })
        }
      }
    }
    
    this.characterMaterials.set(characterId, characterInventory)
  }

  // Obter inventário de materiais de um personagem
  getCharacterMaterials(characterId: string): CharacterMaterial[] {
    return this.characterMaterials.get(characterId) || []
  }

  // Obter material específico do inventário
  getCharacterMaterial(characterId: string, materialId: string): CharacterMaterial | undefined {
    const inventory = this.characterMaterials.get(characterId) || []
    return inventory.find(cm => cm.materialId === materialId)
  }

  // Verificar se tem material suficiente
  hasEnoughMaterial(characterId: string, materialId: string, quantity: number): boolean {
    const material = this.getCharacterMaterial(characterId, materialId)
    return material ? material.quantity >= quantity : false
  }

  // Consumir materiais do inventário
  consumeMaterials(characterId: string, requirements: MaterialRequirement[]): boolean {
    const inventory = this.characterMaterials.get(characterId) || []
    
    // Verificar se tem todos os materiais necessários
    for (const req of requirements) {
      const material = inventory.find(cm => cm.materialId === req.materialId)
      if (!material || material.quantity < req.quantity) {
        return false
      }
    }
    
    // Consumir materiais
    for (const req of requirements) {
      const material = inventory.find(cm => cm.materialId === req.materialId)
      if (material) {
        material.quantity -= req.quantity
        material.lastUpdated = new Date()
        
        // Remover se quantidade for zero
        if (material.quantity === 0) {
          const index = inventory.findIndex(cm => cm.id === material.id)
          if (index !== -1) {
            inventory.splice(index, 1)
          }
        }
        
        // Registrar transação
        this.transactions.push({
          id: uuidv4(),
          characterId,
          type: 'craft',
          materialId: req.materialId,
          quantity: -req.quantity,
          tokensExchanged: 0,
          timestamp: new Date()
        })
      }
    }
    
    this.characterMaterials.set(characterId, inventory)
    return true
  }

  // === SISTEMA DE CRAFTING ===

  // Obter receitas disponíveis
  getAvailableRecipes(character: Character): CraftingRecipe[] {
    return CRAFTING_RECIPES.filter(recipe => 
      character.level >= recipe.levelRequired
    )
  }

  // Verificar se pode craftar um item
  canCraft(characterId: string, recipeId: string): boolean {
    const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId)
    if (!recipe) return false
    
    for (const req of recipe.materials) {
      if (!this.hasEnoughMaterial(characterId, req.materialId, req.quantity)) {
        return false
      }
    }
    
    return true
  }

  // Executar crafting
  craftItem(characterId: string, recipeId: string, characterTokens: number): CraftingResult {
    const recipe = CRAFTING_RECIPES.find(r => r.id === recipeId)
    if (!recipe) {
      return {
        success: false,
        materialsUsed: [],
        tokensSpent: 0,
        message: 'Receita não encontrada'
      }
    }
    
    // Verificar se tem tokens suficientes
    if (characterTokens < recipe.cost) {
      return {
        success: false,
        materialsUsed: [],
        tokensSpent: 0,
        message: 'Tokens insuficientes'
      }
    }
    
    // Verificar se pode craftar
    if (!this.canCraft(characterId, recipeId)) {
      return {
        success: false,
        materialsUsed: [],
        tokensSpent: 0,
        message: 'Materiais insuficientes'
      }
    }
    
    // Rolar para sucesso
    const success = Math.random() < recipe.successRate
    
    if (success) {
      // Consumir materiais
      this.consumeMaterials(characterId, recipe.materials)
      
      return {
        success: true,
        item: recipe.resultItem,
        materialsUsed: recipe.materials,
        tokensSpent: recipe.cost,
        message: `${recipe.name} criado com sucesso!`
      }
    } else {
      // Falha - perder metade dos materiais
      const halfMaterials = recipe.materials.map(m => ({
        ...m,
        quantity: Math.floor(m.quantity / 2)
      }))
      
      this.consumeMaterials(characterId, halfMaterials)
      
      return {
        success: false,
        materialsUsed: halfMaterials,
        tokensSpent: Math.floor(recipe.cost / 2),
        message: `Falha no crafting. Alguns materiais foram perdidos.`
      }
    }
  }

  // === SISTEMA DE TRADING ===

  // Calcular valor de troca de materiais
  calculateTradeValue(materials: CharacterMaterial[]): number {
    let totalValue = 0
    
    for (const charMaterial of materials) {
      const material = getMaterialById(charMaterial.materialId)
      if (material) {
        totalValue += material.tokenValue * charMaterial.quantity
      }
    }
    
    return totalValue
  }

  // Vender materiais por tokens
  sellMaterials(characterId: string, offers: TradeOffer[]): number {
    let totalTokens = 0
    
    for (const offer of offers) {
      const material = getMaterialById(offer.materialId)
      if (material && this.hasEnoughMaterial(characterId, offer.materialId, offer.quantity)) {
        // Consumir materiais
        this.consumeMaterials(characterId, [{ materialId: offer.materialId, quantity: offer.quantity }])
        
        // Calcular tokens
        const tokens = offer.quantity * offer.pricePerUnit
        totalTokens += tokens
        
        // Registrar transação
        this.transactions.push({
          id: uuidv4(),
          characterId,
          type: 'sell',
          materialId: offer.materialId,
          quantity: -offer.quantity,
          tokensExchanged: tokens,
          timestamp: new Date()
        })
      }
    }
    
    return totalTokens
  }

  // Comprar materiais com tokens
  buyMaterials(characterId: string, offers: TradeOffer[], characterTokens: number): boolean {
    const totalCost = offers.reduce((sum, offer) => sum + offer.totalPrice, 0)
    
    if (characterTokens < totalCost) {
      return false
    }
    
    // Adicionar materiais ao inventário
    const loot: DungeonLoot[] = offers.map(offer => {
      const material = getMaterialById(offer.materialId)
      return {
        id: uuidv4(),
        type: RewardType.MATERIAL,
        name: material?.name || 'Unknown',
        rarity: material?.rarity || Rarity.COMMON,
        quantity: offer.quantity,
        value: offer.totalPrice,
        description: material?.description || ''
      }
    })
    
    this.addMaterials(characterId, loot)
    
    // Registrar transações
    for (const offer of offers) {
      this.transactions.push({
        id: uuidv4(),
        characterId,
        type: 'buy',
        materialId: offer.materialId,
        quantity: offer.quantity,
        tokensExchanged: -offer.totalPrice,
        timestamp: new Date()
      })
    }
    
    return true
  }

  // === FUNÇÕES UTILITÁRIAS ===

  // Obter estatísticas do inventário
  getInventoryStats(characterId: string): {
    totalMaterials: number
    totalValue: number
    rarityDistribution: Record<Rarity, number>
    typeDistribution: Record<MaterialType, number>
  } {
    const inventory = this.getCharacterMaterials(characterId)
    const stats = {
      totalMaterials: 0,
      totalValue: 0,
      rarityDistribution: {
        [Rarity.COMMON]: 0,
        [Rarity.UNCOMMON]: 0,
        [Rarity.RARE]: 0,
        [Rarity.EPIC]: 0,
        [Rarity.LEGENDARY]: 0
      },
      typeDistribution: {
        [MaterialType.METAL]: 0,
        [MaterialType.GEM]: 0,
        [MaterialType.ORGANIC]: 0,
        [MaterialType.MAGICAL]: 0,
        [MaterialType.RARE_EARTH]: 0,
        [MaterialType.ESSENCE]: 0
      }
    }
    
    for (const charMaterial of inventory) {
      const material = getMaterialById(charMaterial.materialId)
      if (material) {
        stats.totalMaterials += charMaterial.quantity
        stats.totalValue += material.tokenValue * charMaterial.quantity
        stats.rarityDistribution[material.rarity] += charMaterial.quantity
        stats.typeDistribution[material.type] += charMaterial.quantity
      }
    }
    
    return stats
  }

  // Obter histórico de transações
  getTransactionHistory(characterId: string, limit: number = 10): MaterialTransaction[] {
    return this.transactions
      .filter(t => t.characterId === characterId)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
  }

  // Obter materiais mais valiosos
  getMostValuableMaterials(characterId: string, limit: number = 5): Array<{
    material: Material
    quantity: number
    totalValue: number
  }> {
    const inventory = this.getCharacterMaterials(characterId)
    const valuable = inventory
      .map(charMaterial => {
        const material = getMaterialById(charMaterial.materialId)
        return material ? {
          material,
          quantity: charMaterial.quantity,
          totalValue: material.tokenValue * charMaterial.quantity
        } : null
      })
      .filter(item => item !== null)
      .sort((a, b) => (b?.totalValue || 0) - (a?.totalValue || 0))
      .slice(0, limit)
    
    return valuable as Array<{
      material: Material
      quantity: number
      totalValue: number
    }>
  }

  // Sugerir materiais para vender
  suggestMaterialsToSell(characterId: string): TradeOffer[] {
    const inventory = this.getCharacterMaterials(characterId)
    const suggestions: TradeOffer[] = []
    
    for (const charMaterial of inventory) {
      const material = getMaterialById(charMaterial.materialId)
      if (material && charMaterial.quantity > 5) {
        // Sugerir vender excesso de materiais comuns
        if (material.rarity === Rarity.COMMON && charMaterial.quantity > 10) {
          const sellQuantity = Math.floor(charMaterial.quantity / 2)
          suggestions.push({
            materialId: material.id,
            quantity: sellQuantity,
            pricePerUnit: material.tokenValue,
            totalPrice: material.tokenValue * sellQuantity
          })
        }
      }
    }
    
    return suggestions
  }
}

// === RECEITAS DE CRAFTING ===

const CRAFTING_RECIPES: CraftingRecipe[] = [
  // Armas básicas
  {
    id: 'craft_iron_sword',
    name: 'Espada de Ferro Aprimorada',
    description: 'Uma espada de ferro com lâmina mais afiada',
    resultType: 'weapon',
    resultItem: {
      id: 'crafted_iron_sword',
      name: 'Espada de Ferro Aprimorada',
      type: WeaponType.SWORD,
      diceType: DiceType.D12,
      bonuses: { strength: 30 },
      durability: 100,
      maxDurability: 100,
      value: 300,
      rarity: Rarity.UNCOMMON,
      description: 'Espada de ferro forjada com técnica aprimorada'
    },
    materials: [
      { materialId: 'iron_ore', quantity: 5 },
      { materialId: 'stone', quantity: 2 }
    ],
    levelRequired: 10,
    cost: 50,
    successRate: 0.8,
    rarity: Rarity.UNCOMMON
  },
  {
    id: 'craft_silver_dagger',
    name: 'Adaga de Prata',
    description: 'Adaga leve e precisa feita de prata',
    resultType: 'weapon',
    resultItem: {
      id: 'crafted_silver_dagger',
      name: 'Adaga de Prata',
      type: WeaponType.DAGGER,
      diceType: DiceType.D8,
      bonuses: { dexterity: 25 },
      durability: 95,
      maxDurability: 100,
      value: 200,
      rarity: Rarity.RARE,
      description: 'Adaga brilhante feita de prata pura'
    },
    materials: [
      { materialId: 'silver_ore', quantity: 3 },
      { materialId: 'leather', quantity: 1 }
    ],
    levelRequired: 15,
    cost: 100,
    successRate: 0.7,
    rarity: Rarity.RARE
  },
  
  // Armaduras
  {
    id: 'craft_reinforced_leather',
    name: 'Armadura de Couro Reforçada',
    description: 'Armadura de couro com proteção extra',
    resultType: 'armor',
    resultItem: {
      id: 'crafted_reinforced_leather',
      name: 'Armadura de Couro Reforçada',
      type: ArmorType.LIGHT,
      bonuses: { dexterity: 15, constitution: 25 },
      durability: 90,
      maxDurability: 100,
      value: 200,
      rarity: Rarity.UNCOMMON,
      description: 'Armadura de couro com placas de metal estrategicamente posicionadas'
    },
    materials: [
      { materialId: 'leather', quantity: 4 },
      { materialId: 'iron_ore', quantity: 2 }
    ],
    levelRequired: 8,
    cost: 75,
    successRate: 0.85,
    rarity: Rarity.UNCOMMON
  },
  
  // Itens avançados
  {
    id: 'craft_mithril_sword',
    name: 'Espada de Mithril',
    description: 'Lâmina lendária feita do raro mithril',
    resultType: 'weapon',
    resultItem: {
      id: 'crafted_mithril_sword',
      name: 'Espada de Mithril',
      type: WeaponType.SWORD,
      diceType: DiceType.D12,
      bonuses: { strength: 70, dexterity: 20 },
      durability: 100,
      maxDurability: 100,
      value: 2000,
      rarity: Rarity.EPIC,
      description: 'Espada forjada com mithril, leve mas incrivelmente resistente'
    },
    materials: [
      { materialId: 'mithril_ore', quantity: 2 },
      { materialId: 'blue_crystal', quantity: 1 },
      { materialId: 'dragon_scale_minor', quantity: 1 }
    ],
    levelRequired: 40,
    cost: 500,
    successRate: 0.5,
    rarity: Rarity.EPIC
  },
  
  // Itens lendários
  {
    id: 'craft_legendary_blade',
    name: 'Lâmina Lendária',
    description: 'A arma definitiva forjada com os materiais mais raros',
    resultType: 'weapon',
    resultItem: {
      id: 'crafted_legendary_blade',
      name: 'Lâmina Lendária',
      type: WeaponType.SWORD,
      diceType: DiceType.D20,
      bonuses: { strength: 100, dexterity: 50, constitution: 30 },
      durability: 100,
      maxDurability: 100,
      value: 10000,
      rarity: Rarity.LEGENDARY,
      description: 'Lâmina forjada com o coração de um dragão ancião, pulsa com poder divino'
    },
    materials: [
      { materialId: 'dragon_heart', quantity: 1 },
      { materialId: 'adamantite_ore', quantity: 3 },
      { materialId: 'divine_essence', quantity: 1 }
    ],
    levelRequired: 80,
    cost: 5000,
    successRate: 0.2,
    rarity: Rarity.LEGENDARY
  }
]

// Instância global do sistema de materiais
export const materialSystem = new MaterialSystem() 