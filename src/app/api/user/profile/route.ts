import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    // Mock de perfil de usuário para demonstração
    const mockUser = {
      id: 'user_' + Math.random().toString(36).substr(2, 9),
      name: 'Aventureiro',
      level: 1,
      hp: 100,
      maxHp: 100,
      mp: 50,
      maxMp: 50,
      attack: 10,
      defense: 5,
      equipment: {},
      experience: 0,
      gold: 100
    }

    return NextResponse.json(mockUser)
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao carregar perfil' },
      { status: 500 }
    )
  }
}