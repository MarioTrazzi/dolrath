import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { newDungeonSystem } from '@/lib/newDungeonSystem'

export async function POST(req: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { instanceId, action, characterId } = await req.json()
    
    console.log('⚔️ Ação de combate:', { instanceId, action, characterId })
    console.log('🔍 Instâncias ativas:', newDungeonSystem.listActiveInstances())

    // Primeiro tentar encontrar por instanceId
    let instance = newDungeonSystem.getInstance(instanceId)
    
    // Se não encontrar, tentar encontrar por characterId
    if (!instance && characterId) {
      console.log('❌ Instância não encontrada por ID, tentando por characterId...')
      instance = newDungeonSystem.getActiveInstance(characterId)
      
      if (instance) {
        console.log('✅ Instância encontrada por characterId:', instance.id)
      }
    }
    
    // Se ainda não encontrar, criar nova instância
    if (!instance && characterId) {
      console.log('❌ Nenhuma instância encontrada. Criando nova instância...')
      instance = newDungeonSystem.createInstance('goblin_caves', characterId)
      console.log('✅ Nova instância criada:', instance.id)
    }
    
    if (!instance) {
      return NextResponse.json({ error: 'Não foi possível encontrar ou criar instância da dungeon' }, { status: 400 })
    }

    // Executar combate
    const result = newDungeonSystem.executeCombat(instance.id, action)
    
    console.log('✅ Resultado:', result)
    return NextResponse.json(result)

  } catch (error: any) {
    console.error('❌ Erro no combate:', error)
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 })
  }
}
