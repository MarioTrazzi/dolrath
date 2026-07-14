'use client';

// 🌳 Página dedicada da Árvore de Habilidades — a distribuição de pontos saiu da
// ficha do personagem e vive aqui. A ficha agora só mostra um botão de "subiu de
// nível" que aponta pra cá quando há pontos pra gastar.
//
// Personagem NOVO (skillTree != null) usa o SkillTreePanel. Personagem LEGADO
// (skillTree null) cai no painel de atributos antigo até passar pelo respec único
// (scripts/migrate-skill-tree-respec.ts).

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { Character } from '@/types/game';
import SkillTreePanel from '@/components/SkillTreePanel';
import AttributeDistributionPanel from '@/components/AttributeDistributionPanel';
import { getSkillTree, getSkillPaths, getSkillTreeState } from '@/lib/skillTree';
import { getRaceById, getClassById } from '@/lib/gameData';
import { getBlendedVisual } from '@/lib/creationVisuals';
import CreationCardBackdrop from '@/components/character/CreationCardBackdrop';
import { getWalletTxErrorMessage } from '@/lib/walletErrors';

const GOLD = '#c9a25f';
const GOLD_BRIGHT = '#e7c682';
const FRAME = '#8a6d3b';
const PANEL_BG = 'linear-gradient(180deg, rgba(32,32,36,0.94), rgba(24,24,27,0.96))';
const TITLEBAR_BG = 'linear-gradient(180deg, #2b2b2f, #1a1a1d)';

export default function SkillTreePage() {
  const params = useParams();
  const router = useRouter();
  const [character, setCharacter] = useState<Character | null>(null);
  const [effectiveCharacterId, setEffectiveCharacterId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [spending, setSpending] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const raw = Array.isArray((params as any)?.characterId)
          ? String((params as any).characterId[0] || '')
          : String((params as any)?.characterId || '');
        if (!raw) return;

        const response = await fetch(`/api/character/${raw}`);
        if (!response.ok) {
          setCharacter(null);
          return;
        }
        const data = await response.json();
        setEffectiveCharacterId(String(data?.id || ''));
        setCharacter(data);
      } catch (error) {
        console.error('Error fetching character:', error);
      } finally {
        setLoading(false);
      }
    };
    if (params?.characterId) fetchData();
  }, [params?.characterId]);

  const handleSpendSkillPoint = async (nodeId: string) => {
    if (!effectiveCharacterId || spending) return;
    setSpending(true);
    try {
      const response = await fetch(`/api/character/${effectiveCharacterId}/skill-tree/spend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nodeId }),
      });
      const result = await response.json().catch(() => null);
      if (response.ok && result?.success) {
        toast.success(`Aprendeu "${result.node?.name || 'habilidade'}"!`);
        setCharacter(result.character);
      } else {
        toast.error(String(result?.error || `Erro ao aprender habilidade (HTTP ${response.status})`));
      }
    } catch (error) {
      toast.error(getWalletTxErrorMessage(error, 'Erro ao aprender habilidade'));
    } finally {
      setSpending(false);
    }
  };

  const refreshCharacter = async () => {
    if (!effectiveCharacterId) return;
    const response = await fetch(`/api/character/${effectiveCharacterId}`);
    if (response.ok) setCharacter(await response.json());
  };

  if (loading) {
    return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
  }
  if (!character) {
    return <div className="flex justify-center items-center min-h-screen">Character not found</div>;
  }

  const raceObj = getRaceById(typeof character.race === 'string' ? character.race : character.race.id);
  const classObj = getClassById(typeof character.class === 'string' ? character.class : character.class.id);
  const visual = getBlendedVisual(raceObj?.id, classObj?.id);
  const availablePoints = character.availablePoints ?? 0;
  const hasSkillTree = (character as any).skillTree != null;

  return (
    <div className="relative min-h-screen">
      {/* Cenário animado da raça (fundo da página) */}
      <div className="fixed inset-0 z-0">
        <CreationCardBackdrop theme={visual.backdropTheme} />
        <div className="absolute inset-0 bg-black/70" />
      </div>

      <div className="relative z-10 container mx-auto max-w-4xl px-2 sm:px-4 py-8" style={{ fontFamily: "'Barlow', sans-serif" }}>
        {/* Cabeçalho + voltar pra ficha */}
        <div
          className="mb-4 overflow-hidden rounded-[4px] border border-[#46464c] shadow-2xl shadow-black/60"
          style={{ background: PANEL_BG }}
        >
          <div className="flex items-center justify-between px-4 py-2.5" style={{ background: TITLEBAR_BG, borderBottom: '1px solid rgba(0,0,0,0.7)' }}>
            <Link
              href={`/character/${effectiveCharacterId || (params as any)?.characterId}`}
              className="flex items-center gap-2 text-[13px] font-semibold text-[#c9c9ce] transition-colors hover:text-white"
            >
              <ArrowLeft size={16} /> Voltar à Ficha
            </Link>
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#77777d]">
              {character.name} · Nível {character.level}
            </span>
          </div>

          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-2 text-[15px] font-semibold text-[#dcdce0]">
              <span style={{ color: GOLD }}>✦</span> Árvore de Habilidades
            </div>
            <span
              className="rounded-[3px] border px-3 py-1 text-sm font-bold"
              style={{
                borderColor: availablePoints > 0 ? FRAME : '#46464c',
                background: availablePoints > 0 ? 'linear-gradient(180deg, #3a3325, #241f16)' : 'rgba(0,0,0,0.35)',
                color: availablePoints > 0 ? GOLD_BRIGHT : '#9a9aa2',
              }}
            >
              ✦ {availablePoints} ponto{availablePoints === 1 ? '' : 's'}
            </span>
          </div>
        </div>

        {hasSkillTree ? (
          <SkillTreePanel
            tree={getSkillTree((character as any).class, (character as any).unlockedTransformation)}
            paths={getSkillPaths((character as any).class, (character as any).unlockedTransformation)}
            purchased={getSkillTreeState((character as any).skillTree)?.purchased || []}
            availablePoints={availablePoints}
            busy={spending}
            onSpend={handleSpendSkillPoint}
            classId={classObj?.id ?? String(character.class)}
          />
        ) : availablePoints > 0 ? (
          // Legado: painel de atributos antigo até o respec único converter pra árvore.
          <AttributeDistributionPanel
            characterId={effectiveCharacterId || ''}
            availablePoints={availablePoints}
            currentAttributes={{
              str: (character.attributes as any)?.str || (character.baseStats as any)?.str || 0,
              agi: (character.attributes as any)?.agi || 0,
              int: (character.attributes as any)?.int || 0,
              def:
                (character.attributes as any)?.def ??
                (character.attributes as any)?.defense ??
                (character.attributes as any)?.res ??
                (character.baseStats as any)?.def ??
                (character.baseStats as any)?.res ??
                0,
            }}
            currentStats={{
              hp: character.hp,
              maxHp: character.maxHp,
              mp: (character as any).mp || 0,
              maxMp: (character as any).maxMp || 50,
              stamina: character.stamina,
              maxStamina: character.maxStamina,
              crit: ((character.attributes as any)?.agi || 0) * 0.2,
              speed: ((character.attributes as any)?.agi || 0) * 0.5,
            }}
            onPointsDistributed={refreshCharacter}
          />
        ) : (
          <div
            className="rounded-[4px] border border-[#46464c] p-8 text-center"
            style={{ background: PANEL_BG }}
          >
            <p className="text-[#c9c9ce]">Nenhum ponto para distribuir no momento.</p>
            <button
              onClick={() => router.push(`/character/${effectiveCharacterId}`)}
              className="mt-4 rounded-[3px] border px-6 py-2 text-sm font-semibold text-[#c9c9ce] transition-colors hover:border-[#8a6d3b] hover:text-white"
              style={{ borderColor: '#46464c' }}
            >
              Voltar à Ficha
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
