import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    // Teste de conexão
    await prisma.$connect();
    
    // Teste de query simples
    const userCount = await prisma.user.count();
    const itemCount = await prisma.item.count();
    
    await prisma.$disconnect();
    
    return NextResponse.json({
      success: true,
      message: 'Conexão com banco de dados funcionando!',
      data: {
        userCount,
        itemCount
      }
    });
  } catch (error) {
    console.error('Erro no teste de DB:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    }, { status: 500 });
  }
}
