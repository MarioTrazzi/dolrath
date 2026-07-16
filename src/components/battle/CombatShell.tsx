'use client'

import { useState, type ReactNode } from 'react'

/** Opção no flyout ⚔️ Ataque (host monta label/sub/locked — PvE: MP; PvP: MP+STA). */
export type CombatAttackOption = {
  key: string
  label: string
  sub: string
  locked: boolean
  onPick: () => void
}

/** Forma no picker de transformação (Metamorfo etc.). */
export type CombatTransformFormOption = {
  key: string
  label: string
  sub: string
  locked: boolean
  onPick: () => void
}

export type CombatTransformConfig = {
  /** Mostrar botão/badge de transformação */
  available: boolean
  /** Já transformado nesta luta — badge com nome */
  activeLabel?: string | null
  activeTurnsHint?: string
  used?: boolean
  disabled?: boolean
  title?: string
  buttonLabel?: string
  costHint?: string
  onClick: () => void
  /** Várias formas: flyout em vez de clique direto */
  forms?: CombatTransformFormOption[]
}

type CombatShellProps = {
  /** Arena (BattleScene) e overlays do host */
  children: ReactNode
  /** Últimas linhas do log (o shell mostra até 4) */
  logLines: string[]
  /** Ex.: roster de pack PvE */
  aboveLog?: ReactNode
  /** Linha acima da barra (Auto, chat, sair) */
  toolbar?: ReactNode
  /** true = botões de ação; false = statusContent */
  showActions: boolean
  statusContent?: ReactNode
  attackOptions: CombatAttackOption[]
  transform?: CombatTransformConfig | null
  showItemButton?: boolean
  onOpenItems?: () => void
  /** Ex.: Recuar (só PvE) */
  extraActions?: ReactNode
  className?: string
}

/**
 * Shell visual compartilhado do combate (PvE + PvP):
 * arena → log mono → barra horizontal (⚔️ Ataque · Transformar · Item).
 */
export default function CombatShell({
  children,
  logLines,
  aboveLog,
  toolbar,
  showActions,
  statusContent,
  attackOptions,
  transform,
  showItemButton = true,
  onOpenItems,
  extraActions,
  className = '',
}: CombatShellProps) {
  const [showAttackMenu, setShowAttackMenu] = useState(false)
  const [showFormPicker, setShowFormPicker] = useState(false)

  const visibleLog = logLines.slice(-4)
  const multiForms = (transform?.forms?.length ?? 0) > 1

  return (
    <div className={`flex-1 flex flex-col min-h-0 relative z-10 ${className}`}>
      {children}

      {aboveLog}

      <div className="flex-shrink-0 bg-black/60 border-t border-white/5 px-3 sm:px-6 py-1.5">
        <div className="mx-auto max-w-2xl h-[54px] overflow-y-auto overscroll-contain flex flex-col justify-end gap-0.5 font-mono text-[11px] leading-tight text-white/65">
          {visibleLog.length === 0 ? (
            <div className="text-white/40">⚔️ O log da luta aparece aqui</div>
          ) : (
            visibleLog.map((line, i) => (
              <div key={`${logLines.length}-${i}`} className="break-words last:text-white/90">
                {line}
              </div>
            ))
          )}
        </div>
      </div>

      <div
        className="relative flex-shrink-0 bg-black/70 backdrop-blur-md border-t border-white/10 px-3 sm:px-6 pt-1.5 flex flex-col"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <div className="h-9 flex items-center justify-end gap-1.5">{toolbar}</div>

        <div className="min-h-[56px] flex items-center justify-center">
          {showActions ? (
            <div className="flex flex-wrap items-center justify-center gap-1.5 sm:gap-2">
              <div className="relative">
                <button
                  type="button"
                  onClick={() => {
                    setShowFormPicker(false)
                    setShowAttackMenu(v => !v)
                  }}
                  className="px-4 sm:px-5 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white whitespace-nowrap transition-all shadow-lg bg-gradient-to-r from-red-700 to-red-500 hover:scale-105"
                >
                  ⚔️ Ataque
                </button>
                {showAttackMenu && (
                  <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-64 bg-black/90 backdrop-blur-md border border-white/15 rounded-xl p-2 shadow-2xl space-y-1">
                    {attackOptions.map(opt => (
                      <button
                        type="button"
                        key={opt.key}
                        onClick={() => {
                          setShowAttackMenu(false)
                          opt.onPick()
                        }}
                        disabled={opt.locked}
                        title={opt.locked ? 'Indisponível — recurso/recarga insuficiente' : undefined}
                        className={`w-full flex items-center justify-between text-left px-3 py-2 rounded-lg transition-colors ${
                          opt.locked ? 'opacity-40 cursor-not-allowed bg-white/5' : 'bg-white/10 hover:bg-white/20'
                        }`}
                      >
                        <span className="font-bold text-white text-xs">{opt.label}</span>
                        <span className="text-[10px] text-white/60">{opt.sub}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {transform?.available && (
                <div className="relative">
                  {transform.activeLabel ? (
                    <div className="px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white whitespace-nowrap bg-gradient-to-r from-fuchsia-700 to-purple-600 shadow-lg shadow-purple-900/50">
                      {transform.activeLabel}
                      {transform.activeTurnsHint && (
                        <span className="ml-1.5 text-[10px] opacity-75 font-semibold">
                          {transform.activeTurnsHint}
                        </span>
                      )}
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (transform.used || transform.disabled) return
                          setShowAttackMenu(false)
                          if (multiForms) setShowFormPicker(v => !v)
                          else transform.onClick()
                        }}
                        disabled={!!transform.used || !!transform.disabled}
                        title={transform.title}
                        className={`px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white whitespace-nowrap transition-all shadow-lg ${
                          transform.used || transform.disabled
                            ? 'bg-gray-700/60 opacity-50 cursor-not-allowed'
                            : 'bg-gradient-to-r from-fuchsia-700 to-purple-600 hover:scale-105'
                        }`}
                      >
                        {transform.buttonLabel ?? (transform.used ? 'Transf. usada' : 'Transformar')}
                        {!transform.used && transform.costHint && (
                          <span className="ml-1.5 text-[10px] opacity-75 font-semibold">
                            {transform.costHint}
                          </span>
                        )}
                      </button>

                      {showFormPicker && multiForms && transform.forms && (
                        <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-50 w-60 bg-black/90 backdrop-blur-md border border-white/15 rounded-xl p-2 shadow-2xl space-y-1">
                          {transform.forms.map(f => (
                            <button
                              type="button"
                              key={f.key}
                              onClick={() => {
                                setShowFormPicker(false)
                                f.onPick()
                              }}
                              disabled={f.locked}
                              className={`w-full text-left px-3 py-2 rounded-lg transition-colors ${
                                f.locked ? 'opacity-40 cursor-not-allowed bg-white/5' : 'bg-white/10 hover:bg-white/20'
                              }`}
                            >
                              <span className="font-bold text-white text-xs">{f.label}</span>
                              <span className="block text-[10px] text-white/60">{f.sub}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {showItemButton && onOpenItems && (
                <button
                  type="button"
                  onClick={() => {
                    setShowAttackMenu(false)
                    setShowFormPicker(false)
                    onOpenItems()
                  }}
                  title="Poções — usar gasta o turno"
                  className="px-3 sm:px-4 py-2.5 rounded-xl font-bold text-xs sm:text-sm text-white whitespace-nowrap transition-all shadow-lg bg-gradient-to-r from-emerald-700 to-green-600 hover:scale-105"
                >
                  Item
                </button>
              )}

              {extraActions}
            </div>
          ) : (
            statusContent ?? null
          )}
        </div>
      </div>
    </div>
  )
}
