import { NextRequest, NextResponse } from 'next/server'

// Mock database for demonstration
let rooms: any[] = [
  {
    id: 'room_1',
    name: 'Arena dos Guerreiros',
    createdBy: 'player_1',
    createdByName: 'Lorde das Batalhas',
    playerCount: 1,
    maxPlayers: 2,
    isPrivate: false,
    status: 'waiting',
    createdAt: new Date(Date.now() - 300000)
  },
  {
    id: 'room_2',
    name: 'Duelo de Campeões',
    createdBy: 'player_2',
    createdByName: 'Mestre da Espada',
    playerCount: 2,
    maxPlayers: 2,
    isPrivate: false,
    status: 'in_progress',
    createdAt: new Date(Date.now() - 600000)
  }
]

export async function GET(request: NextRequest) {
  try {
    // Filter out finished rooms older than 1 hour
    const oneHourAgo = new Date(Date.now() - 3600000)
    rooms = rooms.filter(room => 
      room.status !== 'finished' || room.createdAt > oneHourAgo
    )

    return NextResponse.json(rooms)
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao carregar salas' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, isPrivate, createdBy, createdByName } = body

    if (!name || !createdBy || !createdByName) {
      return NextResponse.json(
        { error: 'Dados obrigatórios não fornecidos' },
        { status: 400 }
      )
    }

    const newRoom = {
      id: 'room_' + Math.random().toString(36).substr(2, 9),
      name: name.trim(),
      createdBy,
      createdByName,
      playerCount: 1,
      maxPlayers: 2,
      isPrivate: !!isPrivate,
      status: 'waiting',
      createdAt: new Date()
    }

    rooms.push(newRoom)

    return NextResponse.json(newRoom, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao criar sala' },
      { status: 500 }
    )
  }
}