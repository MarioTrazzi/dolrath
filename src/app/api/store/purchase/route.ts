import { NextResponse } from 'next/server';
import { auth } from '@/app/api/auth/[...nextauth]/route';

export async function POST(req: Request) {
  const session = await auth();

  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  void req
  return NextResponse.json(
    {
      error:
        'Deprecated endpoint. Use /api/store/purchase-config + /api/store/purchase-intent + /api/store/purchase-confirm (on-chain GOLD payment + item NFT mint).',
      deprecated: true,
    },
    { status: 410 }
  )
}
