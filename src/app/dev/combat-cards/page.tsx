'use client'

// 🧪 Bancada da MÃO DE CARTAS do combate — sem banco/DB/auth (padrão dev/*).
//
// Monta a mão a partir das FONTES REAIS do jogo (getFormSpecials + applyRankPatch,
// CLASS_ATTACK_NAME, PVE_DIE, specialDisplayName), nunca de dados inventados: o que
// aparece aqui é exatamente o que o DungeonRun oferece hoje no flyout "⚔️ Ataque".
// Serve para julgar a CARTA em si — legibilidade, tamanho no celular, estados
// travados — antes de encostar no combate de produção.
//
// Nada em produção importa este arquivo nem o CardHand: enquanto o estágio A não for
// aprovado, o jogo segue com o menu de sempre.
//
// Cenários: os seletores cobrem 4 classes × 6 formas × 6 armas. O slider de MP e o
// botão de recarga exercitam as cartas esmaecidas.

import { useMemo, useState } from 'react'
import CardHand, { splitCardEmoji, type CombatCard } from '@/components/battle/CardHand'
import { CLASS_ATTACK_NAME, PVE_DIE, type CombatClass } from '@/lib/combatModel'
import { getFormSpecials, type SpecialDef } from '@/lib/transformationSpecials'
import { applyRankPatch, LEGACY_UNLOCKS } from '@/lib/skillTree'
import { specialDisplayName, classAttackDisplayName } from '@/lib/weaponFlavor'
import type { TransformationType } from '@/lib/transformationSystem'

const CLASSES: { id: CombatClass; label: string }[] = [
  { id: 'warrior', label: 'Guerreiro' },
  { id: 'rogue', label: 'Ladino' },
  { id: 'mage', label: 'Mago' },
  { id: 'monk', label: 'Monge' },
]

const FORMS: { id: TransformationType; label: string }[] = [
  { id: 'dragon', label: '🐉 Dragão (Draconiano)' },
  { id: 'wolf', label: '🐺 Lobo (Metamorfo)' },
  { id: 'bear', label: '🐻 Urso (Metamorfo)' },
  { id: 'eagle', label: '🦅 Águia (Metamorfo)' },
  { id: 'seventh_sense', label: '🌌 7º Sentido (Humano)' },
  { id: 'celestial', label: '✨ Celestial (Elfo)' },
]

// itemType do slot WEAPON (weaponFlavor.FAMILY_BY_TYPE) — troca só a PELE do golpe.
const WEAPONS = [
  { id: 'SWORD', label: '🗡️ Espada' },
  { id: 'AXE', label: '🪓 Machado' },
  { id: 'DAGGER', label: '🔪 Adaga' },
  { id: 'BOW', label: '🏹 Arco' },
  { id: 'STAFF', label: '🔮 Cajado' },
  { id: 'GAUNTLET', label: '👊 Manopla' },
]

export default function CombatCardsDevPage() {
  const [cls, setCls] = useState<CombatClass>('warrior')
  const [form, setForm] = useState<TransformationType>('dragon')
  const [weapon, setWeapon] = useState('SWORD')
  const [transformed, setTransformed] = useState(true)
  const [mp, setMp] = useState(40)
  // Recarga simulada da habilidade ASSINATURA (a 1ª de dano da forma).
  const [cdOnSignature, setCdOnSignature] = useState(false)
  const [played, setPlayed] = useState<string[]>([])

  const unlocks = LEGACY_UNLOCKS // bancada: tudo liberado, sem ranks (personagem legado)

  const specials: SpecialDef[] = useMemo(
    () => (transformed ? getFormSpecials(form).map(def => applyRankPatch(def, unlocks, form)) : []),
    [transformed, form, unlocks],
  )

  const cards: CombatCard[] = useMemo(() => {
    const play = (label: string) => () => setPlayed(p => [`🃏 ${label}`, ...p].slice(0, 8))

    const out: CombatCard[] = [
      {
        key: 'basic',
        name: 'Golpe',
        emoji: '👊',
        tone: 'basic',
        die: PVE_DIE.basic,
        costLabel: 'grátis',
        effectLine: 'Ataque livre de todo mundo. Não gasta MP.',
        locked: false, // o Golpe é o piso: nunca trava
        onPlay: play('Golpe'),
      },
      {
        key: 'weapon',
        name: classAttackDisplayName(cls, weapon, CLASS_ATTACK_NAME[cls]),
        emoji: '⚔️',
        tone: 'class',
        die: unlocks.classAttackDie,
        costLabel: `${unlocks.classAttackMp}🔵`,
        effectLine: 'O ataque de assinatura da classe — o nome muda com a arma equipada.',
        locked: mp < unlocks.classAttackMp,
        lockReason: mp < unlocks.classAttackMp ? 'MP' : undefined,
        onPlay: play(CLASS_ATTACK_NAME[cls]),
      },
    ]

    specials.forEach((def, i) => {
      const shown = specialDisplayName(def, weapon)
      const { emoji, label } = splitCardEmoji(shown, def.kind === 'util' ? '✨' : '💥')
      const mpCost = def.cost.mp || 0
      const onCd = cdOnSignature && i === 0
      const noMp = mp < mpCost
      out.push({
        key: def.id,
        name: label,
        emoji,
        tone: def.kind === 'util' ? 'buff' : 'special',
        die: def.kind === 'util' ? undefined : def.die ?? 20,
        costLabel: `${mpCost}🔵`,
        effectLine: def.desc,
        locked: onCd || noMp,
        lockReason: onCd ? `recarga ${def.cd}` : noMp ? 'MP' : undefined,
        onPlay: play(label),
      })
    })

    return out
  }, [cls, weapon, specials, mp, cdOnSignature, unlocks])

  const selectCls = 'bg-[#26262b] border border-[#46464c] rounded-lg px-3 py-2'

  return (
    <div className="min-h-screen bg-[#141416] p-4 text-white sm:p-8">
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-lg font-bold text-[#e7c682]">🧪 Bancada — Mão de Cartas do Combate</h1>
        <p className="text-xs leading-relaxed text-[#8a8a90]">
          As mesmas ações que o flyout &quot;⚔️ Ataque&quot; oferece hoje, desenhadas como cartas.
          Toque para jogar; segure (ou passe o mouse) para ver o detalhe. Nada aqui muda o
          combate de produção.
        </p>

        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={cls} onChange={e => setCls(e.target.value as CombatClass)} className={selectCls}>
            {CLASSES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <select value={form} onChange={e => setForm(e.target.value as TransformationType)} className={selectCls}>
            {FORMS.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
          <select value={weapon} onChange={e => setWeapon(e.target.value)} className={selectCls}>
            {WEAPONS.map(w => <option key={w.id} value={w.id}>{w.label}</option>)}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            onClick={() => setTransformed(v => !v)}
            className={`rounded-lg px-3 py-2 font-bold ${
              transformed ? 'bg-[#5b3b8a] text-white' : 'border border-[#46464c] text-white/60'
            }`}
          >
            {transformed ? '🐉 Transformado' : '🐉 Forma humana'}
          </button>
          <button
            onClick={() => setCdOnSignature(v => !v)}
            className={`rounded-lg px-3 py-2 font-bold ${
              cdOnSignature ? 'bg-[#e09a3a] text-black' : 'border border-[#46464c] text-white/60'
            }`}
          >
            ⏳ Assinatura em recarga
          </button>
          <label className="flex items-center gap-2 text-[#8a8a90]">
            MP
            <input
              type="range"
              min={0}
              max={40}
              value={mp}
              onChange={e => setMp(Number(e.target.value))}
              className="w-32 accent-[#c9a25f]"
            />
            <span className="w-8 font-mono text-white">{mp}</span>
          </label>
          <span className="text-[#57575c]">{cards.length} cartas</span>
        </div>

        {/* Barra de combate simulada: mesma casca do CombatShell (log + barra preta) para
            julgar a carta no contexto real, não solta no branco. */}
        <div className="overflow-hidden rounded-[4px] border border-[#46464c]">
          <div className="flex h-40 items-center justify-center bg-gradient-to-b from-[#20202a] to-[#121216] text-sm text-white/25">
            (arena — BattleScene entra aqui)
          </div>
          <div className="border-t border-white/5 bg-black/60 px-3 py-1.5">
            <div className="mx-auto flex h-[54px] max-w-2xl flex-col justify-end gap-0.5 font-mono text-[11px] leading-tight text-white/65">
              {played.length === 0 ? (
                <div className="text-white/40">⚔️ O log da luta aparece aqui</div>
              ) : (
                played.slice(0, 4).reverse().map((l, i) => <div key={`${played.length}-${i}`}>{l}</div>)
              )}
            </div>
          </div>
          <div className="border-t border-white/10 bg-black/70 px-2 pb-3 pt-1.5">
            <CardHand cards={cards} />
          </div>
        </div>

        {/* Viewport de celular: 4 cartas precisam caber em 360 px sem rolagem. */}
        <div>
          <div className="mb-1.5 text-xs font-semibold text-[#8a8a90]">📱 360 px (celular pequeno)</div>
          <div className="w-[360px] max-w-full overflow-hidden rounded-[4px] border border-[#46464c] bg-black/70 px-2 pb-3 pt-1.5">
            <CardHand cards={cards} />
          </div>
        </div>
      </div>
    </div>
  )
}
