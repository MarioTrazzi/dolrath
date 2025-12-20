import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  // This endpoint exists for manual diagnostics only.
  // Keep it disabled by default so Next.js build/export doesn't attempt DB connections.
  if (process.env.ENABLE_TEST_DB_ROUTE !== 'true') {
    return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
  }

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
