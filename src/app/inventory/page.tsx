'use client';

// 📦 O inventário deixou de ser página própria: o inventário do herói e o Baú
// Geral da conta agora moram juntos na ficha do personagem (/character/[id]),
// onde a transferência entre os dois acontece sem trocar de tela. Esta rota fica
// de pé só para não quebrar links antigos.

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useActiveCharacter } from '@/components/providers/ActiveCharacterProvider';

export default function InventoryRedirectPage() {
  const router = useRouter();
  const { activeCharacterId, loading } = useActiveCharacter();

  useEffect(() => {
    if (loading) return;
    router.replace(activeCharacterId ? `/character/${activeCharacterId}` : '/character/create');
  }, [loading, activeCharacterId, router]);

  return (
    <div className="min-h-[60dvh] grid place-items-center text-[#8a8a90]">Abrindo a ficha…</div>
  );
}
