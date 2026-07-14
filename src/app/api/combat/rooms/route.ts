import { NextRequest, NextResponse } from 'next/server'

// Database para armazenar salas criadas dinamicamente
let rooms: any[] = []

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

// Atualiza playerCount/status de uma sala (chamado pelo socket-server quando um
// bot de PvP ocupa/encerra uma sala, para o lobby parar de oferecer a vaga).
// Sem auth: catálogo cosmético em memória — o POST acima já é aberto. Follow-up
// anotado: token compartilhado se isto migrar para DB.
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { id, playerCount, status } = body

    if (!id) {
      return NextResponse.json({ error: 'id obrigatório' }, { status: 400 })
    }

    const room = rooms.find(r => r.id === id)
    if (!room) {
      return NextResponse.json({ error: 'Sala não encontrada' }, { status: 404 })
    }

    // Whitelist: só os dois campos que o lobby usa para exibir/ocultar a vaga
    if (typeof playerCount === 'number' && playerCount >= 0 && playerCount <= 2) {
      room.playerCount = playerCount
    }
    if (status === 'waiting' || status === 'in_progress' || status === 'finished') {
      room.status = status
    }

    return NextResponse.json(room)
  } catch (error) {
    return NextResponse.json(
      { error: 'Erro ao atualizar sala' },
      { status: 500 }
    )
  }
}