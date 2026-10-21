import { NextRequest, NextResponse } from 'next/server'
import { getT } from '@/lib/i18n/server'
import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { rateLimitAllow, rateLimited429 } from '@/lib/rateLimit'

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
  const t = getT()
  try {
    // Nada marca a sala como 'finished': o corte é por idade (o socket é que
    // sabe se a luta acabou; aqui é só a vitrine do lobby).
    const oneHourAgo = new Date(Date.now() - 3600000)
    rooms = rooms.filter((room) => room.createdAt > oneHourAgo)

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
  const t = getT()
  try {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!rateLimitAllow(`combat-room-create:${session.user.id}`, { windowMs: 60_000, max: 10 })) {
      return rateLimited429()
    }
    const body = await request.json()
    const { name, isPrivate, createdBy, password } = body

    if (!name || !createdBy || typeof createdBy !== 'string') {
      return NextResponse.json(
        { error: t('Required data not provided') },
        { status: 400 }
      )
    }
    // O criador é um herói DESTA conta (nome lido do banco, não do corpo).
    const hero = await prisma.character.findFirst({
      where: { id: createdBy, userId: session.user.id },
      select: { name: true },
    })
    if (!hero) {
      return NextResponse.json({ error: t('Character not found') }, { status: 404 })
    }
    const createdByName = hero.name

    const pw =
      typeof password === 'string' && password.trim().length >= 4
        ? password.trim().slice(0, 32)
        : null

    // Sala "privada" sem senha vira pública listada; com senha = amigos only.
    const hasPassword = !!pw

    const newRoom: StoredRoom = {
      id: 'room_' + Math.random().toString(36).substr(2, 9),
      name: String(name).trim().slice(0, 40),
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
  const t = getT()
  try {
    // Senha de sala por força bruta: teto por conta.
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (!rateLimitAllow(`combat-room-pw:${session.user.id}`, { windowMs: 60_000, max: 10 })) {
      return rateLimited429()
    }
    const body = await request.json()
    const { roomId, password } = body
    const room = rooms.find((r) => r.id === roomId)
    if (!room) {
      return NextResponse.json({ error: t('Room not found') }, { status: 404 })
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
