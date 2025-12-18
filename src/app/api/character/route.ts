import { auth } from '@/app/api/auth/[...nextauth]/route'
import { prisma } from '@/lib/prisma'
import { NextResponse } from 'next/server'
import { recordCharacterCreated } from '@/lib/characterHistory'
import { RACES, CLASSES, getRaceById, getClassById } from '@/lib/gameData'
import { verifyDolTransferTx } from '@/lib/dolPayments'
import { getCharacterNftChainId, getCharacterNftContractAddress } from '@/lib/characterNftOnchain'
import { verifyCharacterNftMintTx } from '@/lib/characterNftVerify'

function serializeBigIntForJson<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, v) => (typeof v === 'bigint' ? v.toString() : v))
  ) as T
}

export async function POST(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  console.log('🔍 DEBUG - Criação de personagem:')
  console.log('Session user ID:', session.user.id)
  console.log('Session user email:', session.user.email)

  // Verify user exists in the database
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
  });

  console.log('User found in database:', user ? {
    id: user.id,
    email: user.email,
    name: user.name
  } : 'null')

  if (!user) {
    // Tentar buscar por email como fallback
    const userByEmail = await prisma.user.findUnique({
      where: { email: session.user.email || '' },
    });
    
    console.log('User by email fallback:', userByEmail ? {
      id: userByEmail.id,
      email: userByEmail.email,
      name: userByEmail.name
    } : 'null')
    
    if (userByEmail) {
      console.log('⚠️ AVISO: Usuário encontrado por email mas ID da sessão não confere!')
      console.log('ID da sessão:', session.user.id)
      console.log('ID no banco:', userByEmail.id)
    }
    
    return NextResponse.json({ 
      error: 'User not found',
      debug: {
        sessionUserId: session.user.id,
        sessionUserEmail: session.user.email,
        userFoundById: !!user,
        userFoundByEmail: !!userByEmail
      }
    }, { status: 404 });
  }

  if (!user.walletAddress) {
    return NextResponse.json(
      { error: 'Wallet required to create character', requiresWallet: true },
      { status: 403 }
    )
  }

  const body = (await req.json().catch(() => null)) as any
  if (!body) {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    name,
    race,
    characterClass: class_,
    distributedPoints,
    avatar,
    image,
    creationTxHash,
    nftMintTxHash,
    nftTokenId,
    nftTokenUri,
  } = body

  const avatarUrl = (typeof avatar === 'string' && avatar.trim())
    ? avatar
    : (typeof image === 'string' && image.trim())
      ? image
      : null

  const treasuryAddress = (process.env.DOL_TREASURY_ADDRESS || '').trim()
  const creationCostDol = (process.env.CHARACTER_CREATION_COST_DOL || '2').trim()
  const creationTxHashStr = (typeof creationTxHash === 'string' ? creationTxHash : '').trim()
  const nftMintTxHashStr = (typeof nftMintTxHash === 'string' ? nftMintTxHash : '').trim()
  const nftTokenUriStr = (typeof nftTokenUri === 'string' ? nftTokenUri : '').trim()
  const nftTokenIdBigint =
    typeof nftTokenId === 'string' || typeof nftTokenId === 'number'
      ? BigInt(nftTokenId)
      : typeof nftTokenId === 'bigint'
        ? nftTokenId
        : null

  if (!treasuryAddress) {
    return NextResponse.json(
      { error: 'Server missing DOL_TREASURY_ADDRESS' },
      { status: 500 }
    )
  }

  if (!creationTxHashStr) {
    return NextResponse.json(
      {
        error: 'Payment required to create character',
        requiresPayment: true,
        amountDol: creationCostDol,
        treasuryAddress,
      },
      { status: 402 }
    )
  }

  if (!name || !race || !class_) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  // If NFT is configured, require a mint tx as part of creation.
  const nftContract = getCharacterNftContractAddress()
  const nftChainId = getCharacterNftChainId()
  if (nftContract) {
    if (!nftMintTxHashStr || !nftTokenUriStr || nftTokenIdBigint === null) {
      return NextResponse.json(
        { error: 'NFT mint required to create character', requiresNftMint: true },
        { status: 422 }
      )
    }
  }

  try {
    // Verify on-chain DOL payment (testnet: fixed amount).
    await verifyDolTransferTx({
      txHash: creationTxHashStr,
      expectedFrom: user.walletAddress,
      expectedTo: treasuryAddress,
      minAmountHuman: creationCostDol,
    })

    // Verify NFT mint tx (user-paid gas)
    let nftVerified:
      | { contractAddress: string; tokenId: bigint; tokenURI: string }
      | null = null

    if (nftContract) {
      nftVerified = await verifyCharacterNftMintTx({
        txHash: nftMintTxHashStr,
        expectedTo: user.walletAddress,
        expectedContract: nftContract,
        expectedTokenId: nftTokenIdBigint || undefined,
        expectedTokenUri: nftTokenUriStr,
      })
    }

    // 🔥 BUSCAR DADOS DE RAÇA E CLASSE PARA APLICAR BÔNUS
    const raceData = getRaceById(race)
    const classData = getClassById(class_)
    
    if (!raceData || !classData) {
      return NextResponse.json({ error: 'Invalid race or class' }, { status: 400 })
    }

    // Validar e extrair os valores dos atributos distribuídos pelo jogador
    const distributedStr = Number(distributedPoints?.str || 0)
    const distributedAgi = Number(distributedPoints?.agi || 0)
    const distributedInt = Number(distributedPoints?.int || 0)
    const distributedDef = Number(distributedPoints?.def || 0)

    // Basic validation (prevents client tampering and keeps balance constraints)
    const totalDistributed = distributedStr + distributedAgi + distributedInt + distributedDef
    const maxPerStat = 10
    const expectedTotal = 15
    const allInts = [distributedStr, distributedAgi, distributedInt, distributedDef].every((v) => Number.isFinite(v) && Number.isInteger(v))
    const inRange = [distributedStr, distributedAgi, distributedInt, distributedDef].every((v) => v >= 0 && v <= maxPerStat)

    if (!allInts || !inRange || totalDistributed !== expectedTotal) {
      return NextResponse.json(
        {
          error: 'Invalid distributedPoints',
          details: {
            expectedTotal,
            maxPerStat,
            received: { str: distributedStr, agi: distributedAgi, int: distributedInt, def: distributedDef },
            totalDistributed,
          },
        },
        { status: 400 }
      )
    }

    // 🔥 APLICAR BÔNUS RACIAIS E DE CLASSE
    // Stats base (conversão do sistema antigo para o novo balanceado)
    const raceStr = Math.floor((raceData.bonuses.strength || 0) / 10)  // Converter de 0-100 para 0-10
    const raceAgi = Math.floor((raceData.bonuses.dexterity || 0) / 10)
    const raceInt = Math.floor((raceData.bonuses.intelligence || 0) / 10)  
    const raceDef = Math.floor((raceData.bonuses.constitution || 0) / 10)
    
    const classStr = Math.floor((classData.bonuses.strength || 0) / 10)
    const classAgi = Math.floor((classData.bonuses.dexterity || 0) / 10)
    const classInt = Math.floor((classData.bonuses.intelligence || 0) / 10)
    const classDef = Math.floor((classData.bonuses.constitution || 0) / 10)

    // 🔥 STATS FINAIS = DISTRIBUIÇÃO + BÔNUS RACIAL + BÔNUS DE CLASSE
    const finalStr = distributedStr + raceStr + classStr
    const finalAgi = distributedAgi + raceAgi + classAgi  
    const finalInt = distributedInt + raceInt + classInt
    const finalDef = distributedDef + raceDef + classDef

    // 🔥 FÓRMULAS BALANCEADAS COM BÔNUS - Todos os stats são úteis
    const baseHp = 80 + (finalStr * 2) + (finalDef * 4)    // DEF mais valioso para HP
    const baseMp = 60 + (finalInt * 3) + (finalAgi * 1)    // INT menos dominante
    const baseStamina = 120 + (finalAgi * 3)               // AGI menos dominante

    const baseStats = {
      hp: baseHp,
      maxHp: baseHp,
      mp: baseMp,
      maxMp: baseMp,
      stamina: baseStamina,
      maxStamina: baseStamina,
      str: finalStr,
      agi: finalAgi,
      int: finalInt,
      def: finalDef,
      // Novos stats calculados com valores finais
      attack: Math.floor(finalStr * 1.2),                     // STR menos dominante
      defense: Math.floor(finalDef * 0.8),                    // DEF reduz dano real
      critical: (finalAgi * 0.8) + 5,                         // AGI mais útil para crit
      magicPower: Math.floor(finalInt * 1.5),                 // INT para ataques mágicos
      dodgeChance: finalAgi * 0.3,                            // AGI para esquiva
      magicResistance: Math.floor(finalInt * 0.4),            // INT para resistir magia
      // Bônus aplicados para referência
      raceBonuses: {
        str: raceStr, agi: raceAgi, int: raceInt, def: raceDef,
        abilities: raceData.abilities
      },
      classBonuses: {
        str: classStr, agi: classAgi, int: classInt, def: classDef,
        abilities: classData.abilities
      }
    };

    const attributes = distributedPoints ? {
      // Stats distribuídos pelo jogador
      distributedStr, distributedAgi, distributedInt, distributedDef,
      // Stats finais (com bônus)
      str: finalStr, agi: finalAgi, int: finalInt, def: finalDef,
      // Stats derivados
      crit: (finalAgi * 0.8) + 5,                             // 5% base + AGI
      speed: finalAgi * 0.5,
      magicResistance: (finalInt * 0.2) + (finalDef * 0.1),   // INT e DEF protegem de magia
      // Transformação disponível
      canTransform: raceData.transformationAvailable
    } : {};

    const character = await prisma.character.create({
      data: {
        name,
        race,
        class: class_,
        avatar: avatarUrl,
        level: 1,
        experience: 0,
        // Stats calculados baseados na distribuição + bônus raciais/classe
        hp: baseHp,
        maxHp: baseHp,
        mp: baseMp,
        maxMp: baseMp,
        stamina: baseStamina,
        maxStamina: baseStamina,
        baseStats: baseStats,
        attributes: {
          ...attributes,
          // Adicionar informações de transformação para raças que podem
          isTransformed: false,
          transformationType: null,
          transformationData: null,
          
          // Dados das habilidades para referência
          raceAbilities: raceData.abilities,
          classAbilities: classData.abilities,
          
          // Strength/Agility/Intelligence/Defense finais para o novo sistema
          strength: finalStr,
          agility: finalAgi, 
          intelligence: finalInt,
          defense: finalDef
        },
        gold: 0,
        creationTxHash: creationTxHashStr,
        creationPaidAt: new Date(),
        nftChainId: nftVerified ? nftChainId : null,
        nftContract: nftVerified ? nftVerified.contractAddress : null,
        nftTokenId: nftVerified ? nftVerified.tokenId : null,
        nftTokenUri: nftVerified ? nftVerified.tokenURI : null,
        nftMintTxHash: nftVerified ? nftMintTxHashStr : null,
        nftMintedAt: nftVerified ? new Date() : null,
        user: {
          connect: {
            id: session.user.id,
          },
        },
      },
    })

    // Log de criação para debug
    console.log(`🎯 Personagem criado com bônus:`)
    console.log(`📊 Raça ${race}:`, raceData.bonuses)
    console.log(`⚔️ Classe ${class_}:`, classData.bonuses)
    console.log(`🔢 Stats finais: STR:${finalStr} AGI:${finalAgi} INT:${finalInt} DEF:${finalDef}`)
    console.log(`💖 HP:${baseHp} 💙 MP:${baseMp} ⚡ Stamina:${baseStamina}`)

    // Registrar no histórico
    try {
      await recordCharacterCreated(character.id, name, race, class_);
    } catch (historyError) {
      console.error('Erro ao registrar histórico:', historyError);
      // Não falhar a operação por causa do histórico
    }

    return NextResponse.json(serializeBigIntForJson(character))
  } catch (error) {
    if ((error as any)?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Pagamento já utilizado para criar outro personagem' },
        { status: 409 }
      )
    }
    console.error('Error creating character:', error)
    let errorMessage = 'Error creating character'
    if (error instanceof Error) {
      errorMessage = error.message
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

export async function GET(req: Request) {
  const session = await auth()

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const characters = await prisma.character.findMany({
      where: { userId: session.user.id },
      orderBy: { createdAt: 'desc' }
    })

    return NextResponse.json(serializeBigIntForJson(characters))
  } catch (error) {
    console.error('Error fetching characters:', error)
    return NextResponse.json({ error: 'Error fetching characters' }, { status: 500 })
  }
}
