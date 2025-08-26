import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: { characterId: string } }
) {
  console.log('=== EQUIP API TEST ===');
  console.log('Character ID:', params.characterId);
  
  try {
    const body = await request.json();
    console.log('Request body:', body);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Test successful',
      characterId: params.characterId,
      body 
    });
  } catch (error) {
    console.error('Error in equip API:', error);
    return NextResponse.json({ error: 'Test error' }, { status: 500 });
  }
}