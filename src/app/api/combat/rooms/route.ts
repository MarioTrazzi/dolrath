import { NextRequest, NextResponse } from 'next/server'

// Store in-memory (lobby metadata). Senha autoritativa no join do socket.
type StoredRoom = {
  id: string
  name: string
  createdBy: string
  createdByName: string
  playerCount: number
  maxPlayers: number
  isPrivate: boolean
  hasPassword: boolean
  /** Nunca exposto no GET */
  password: string | null
  status: string
  createdAt: Date
}

let rooms: StoredRoom[] = []

export async function GET(request: NextRequest) {
  try {
    const oneHourAgo = new Date(Date.now() - 3600000)
    rooms = rooms.filter(
      (room) => room.status !== 'finished' || room.createdAt > oneHourAgo
    )

    // Salas com senha não aparecem na lista pública (amigos usam ID + senha).
    const publicRooms = rooms
      .filter((room) => !room.hasPassword)
      .map(({ password: _pw, ...rest }) => rest)

    return NextResponse.json(publicRooms)
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao carregar salas' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, isPrivate, createdBy, createdByName, password } = body

    if (!name || !createdBy || !createdByName) {
      return NextResponse.json(
        { error: 'Dados obrigatórios não fornecidos' },
        { status: 400 }
      )
    }

    const pw =
      typeof password === 'string' && password.trim().length >= 4
        ? password.trim().slice(0, 32)
        : null

    // Sala "privada" sem senha vira pública listada; com senha = amigos only.
    const hasPassword = !!pw

    const newRoom: StoredRoom = {
      id: 'room_' + Math.random().toString(36).substr(2, 9),
      name: name.trim(),
      createdBy,
      createdByName,
      playerCount: 1,
      maxPlayers: 2,
      isPrivate: hasPassword || !!isPrivate,
      hasPassword,
      password: pw,
      status: 'waiting',
      createdAt: new Date(),
    }

    rooms.push(newRoom)

    // Devolve a senha só na criação (criador / sessionStorage no client).
    return NextResponse.json(
      {
        id: newRoom.id,
        name: newRoom.name,
        createdBy: newRoom.createdBy,
        createdByName: newRoom.createdByName,
        playerCount: newRoom.playerCount,
        maxPlayers: newRoom.maxPlayers,
        isPrivate: newRoom.isPrivate,
        hasPassword: newRoom.hasPassword,
        status: newRoom.status,
        createdAt: newRoom.createdAt,
        password: pw,
      },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json({ error: 'Erro ao criar sala' }, { status: 500 })
  }
}

/** Valida senha de sala (opcional — socket é a autoridade no join). */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { roomId, password } = body
    const room = rooms.find((r) => r.id === roomId)
    if (!room) {
      return NextResponse.json({ error: 'Sala não encontrada' }, { status: 404 })
    }
    if (!room.hasPassword) {
      return NextResponse.json({ ok: true })
    }
    if (String(password || '') !== room.password) {
      return NextResponse.json({ error: 'Senha incorreta' }, { status: 403 })
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ error: 'Erro ao validar senha' }, { status: 500 })
  }
}
