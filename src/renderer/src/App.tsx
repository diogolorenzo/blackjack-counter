import { useEffect, useState } from 'react'

import { isNumLockDependent } from '@shared/defaults'
import { bucketLabel, bucketToDelta, formatSigned } from '@shared/format'
import type { DeepPartial } from '@shared/ipc'
import { HOTKEY_ACTIONS } from '@shared/types'
import type { Bucket, HotkeyAction, HotkeyStatus, Settings } from '@shared/types'

import { BetSuggestion } from '@/components/BetSuggestion'
import { CountDisplay } from '@/components/CountDisplay'
import { HistoryStrip } from '@/components/HistoryStrip'
import { SettingsPanel } from '@/components/SettingsPanel'
import { ShoeMeter } from '@/components/ShoeMeter'
import { TitleBar } from '@/components/TitleBar'
import { useCounterState } from '@/useCounterState'

/** Confirmação de "novo shoe" se desarma sozinha: botão armado esquecido é um clique perdido. */
const NEW_SHOE_CONFIRM_MS = 4000

const ACTION_LABELS: Record<HotkeyAction, string> = {
  low: '2-6',
  neutral: '7-9',
  high: '10-A',
  undo: 'Undo'
}

const STATUS_LABELS: Record<HotkeyStatus, string> = {
  ok: 'registrado',
  conflict: 'tecla ocupada por outro app',
  disabled: 'desativado'
}

const BUCKET_BUTTONS: readonly { bucket: Bucket; tone: string }[] = [
  { bucket: 'low', tone: 'border-pos/30 text-pos hover:bg-pos/10' },
  { bucket: 'neutral', tone: 'border-border text-muted hover:bg-fg/5' },
  { bucket: 'high', tone: 'border-neg/30 text-neg hover:bg-neg/10' }
]

function statusTone(status: HotkeyStatus): string {
  if (status === 'conflict') return 'text-neg'
  if (status === 'disabled') return 'text-muted/50'
  return 'text-fg'
}

/**
 * Não existe API para consultar o NumLock — só o KeyboardEvent carrega o estado.
 * Por isso o valor só se atualiza enquanto esta janela tem o foco, e começa
 * desconhecido (null) até a primeira tecla.
 */
function useNumLockReporter(): void {
  useEffect(() => {
    let last: boolean | null = null

    const report = (event: KeyboardEvent): void => {
      const on = event.getModifierState('NumLock')
      if (on === last) return
      last = on
      void window.counter.reportNumLock(on)
    }

    window.addEventListener('keydown', report)
    window.addEventListener('keyup', report)
    return () => {
      window.removeEventListener('keydown', report)
      window.removeEventListener('keyup', report)
    }
  }, [])
}

interface ActionButtonProps {
  label: string
  onClick: () => void
  disabled?: boolean
  tone?: 'default' | 'warn' | 'active'
  title?: string
}

function ActionButton({
  label,
  onClick,
  disabled = false,
  tone = 'default',
  title
}: ActionButtonProps) {
  const toneClass =
    tone === 'warn'
      ? 'border-warn/50 bg-warn/10 text-warn hover:bg-warn/20'
      : tone === 'active'
        ? 'border-pos/40 bg-pos/10 text-pos hover:bg-pos/20'
        : 'border-border bg-surface text-fg hover:bg-fg/5'

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`h-8 rounded-md border text-[12px] transition-colors duration-100 disabled:opacity-30 ${toneClass}`}
    >
      {label}
    </button>
  )
}

export function App() {
  const { snapshot } = useCounterState()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [confirmNewShoe, setConfirmNewShoe] = useState(false)

  useNumLockReporter()

  useEffect(() => {
    if (!confirmNewShoe) return
    const timer = window.setTimeout(() => setConfirmNewShoe(false), NEW_SHOE_CONFIRM_MS)
    return () => window.clearTimeout(timer)
  }, [confirmNewShoe])

  const toggleSettings = (): void => {
    setConfirmNewShoe(false)
    setSettingsOpen((open) => !open)
  }

  if (snapshot === null) {
    return (
      <div className="flex h-full flex-col">
        <TitleBar settingsOpen={false} onToggleSettings={toggleSettings} />
        <div className="flex flex-1 items-center justify-center">
          <span className="ui-label">Carregando</span>
        </div>
      </div>
    )
  }

  const { derived, settings, hotkeyStatus } = snapshot

  const patch = (value: DeepPartial<Settings>): void => {
    void window.counter.updateSettings(value)
  }

  const handleNewShoe = (): void => {
    if (!confirmNewShoe) {
      setConfirmNewShoe(true)
      return
    }
    setConfirmNewShoe(false)
    void window.counter.newShoe()
  }

  // Bind registrada com sucesso mas que depende do NumLock: register() devolveu
  // true e mesmo assim a tecla não dispara. É a falha silenciosa nº1 do app.
  const riskyBinds = HOTKEY_ACTIONS.filter(
    (action) => hotkeyStatus[action] === 'ok' && isNumLockDependent(settings.bindings[action])
  )

  return (
    <div className="flex h-full flex-col">
      <TitleBar settingsOpen={settingsOpen} onToggleSettings={toggleSettings} />

      {settingsOpen ? (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <SettingsPanel settings={settings} hotkeyStatus={hotkeyStatus} onPatch={patch} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 pt-2.5">
          <CountDisplay runningCount={derived.runningCount} trueCount={derived.trueCountExact} />

          <ShoeMeter
            cardsSeen={derived.cardsSeen}
            totalCards={derived.totalCards}
            decksRemaining={derived.decksRemaining}
            penetration={settings.shoe.penetration}
            penetrationReached={derived.penetrationReached}
          />

          <BetSuggestion
            units={derived.betUnits}
            unitValue={settings.unitValue}
            showCurrency={settings.overlay.showCurrency}
            insuranceOn={derived.insuranceOn}
          />

          <HistoryStrip
            entries={snapshot.recentEntries}
            limit={settings.overlay.historyLength}
          />

          <div className="grid grid-cols-3 gap-1.5">
            {BUCKET_BUTTONS.map(({ bucket, tone }) => {
              const delta = bucketToDelta(bucket)
              return (
                <button
                  key={bucket}
                  type="button"
                  onClick={() => void window.counter.applyCount(delta)}
                  className={`flex h-10 flex-col items-center justify-center gap-0.5 rounded-md border bg-surface transition-colors duration-100 ${tone}`}
                >
                  <span className="tnum text-[13px] font-semibold leading-none">
                    {bucketLabel(bucket)}
                  </span>
                  <span className="tnum text-[10px] leading-none opacity-70">
                    {formatSigned(delta)}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <ActionButton
              label={snapshot.undoRestoresShoe ? 'Desfazer shoe' : 'Desfazer'}
              disabled={!snapshot.canUndo}
              tone={snapshot.undoRestoresShoe ? 'warn' : 'default'}
              onClick={() => void window.counter.undo()}
            />
            <ActionButton
              label="Refazer"
              disabled={!snapshot.canRedo}
              onClick={() => void window.counter.redo()}
            />
            <ActionButton
              label={confirmNewShoe ? 'Confirmar?' : 'Novo shoe'}
              tone={confirmNewShoe ? 'warn' : 'default'}
              title="Zera a contagem do shoe atual"
              onClick={handleNewShoe}
            />
            <ActionButton
              label={settings.overlay.visible ? 'Overlay ligado' : 'Overlay'}
              tone={settings.overlay.visible ? 'active' : 'default'}
              onClick={() => void window.counter.setOverlayVisible(!settings.overlay.visible)}
            />
          </div>

          {derived.shoeExhausted && (
            <p className="text-[11px] text-warn">Shoe esgotado. Comece um novo shoe.</p>
          )}

          {riskyBinds.length > 0 && snapshot.numLockOn === false && (
            <div className="rounded-md border border-warn/50 bg-warn/10 px-2.5 py-2 text-[11px] leading-snug text-warn">
              <span className="font-semibold">NumLock desligado.</span>{' '}
              {riskyBinds.map((action) => settings.bindings[action]).join(', ')} não vai disparar.
              Ligue o NumLock ou troque a tecla em Ajustes.
            </div>
          )}

          {riskyBinds.length > 0 && snapshot.numLockOn === null && (
            <div className="rounded-md border border-border bg-surface px-2.5 py-2 text-[11px] leading-snug text-muted">
              Atalho dependente do NumLock. Pressione qualquer tecla nesta janela para verificar o
              estado.
            </div>
          )}

          <div className="mt-auto grid grid-cols-4 gap-1.5 border-t border-border pt-2">
            {HOTKEY_ACTIONS.map((action) => (
              <div
                key={action}
                className="flex min-w-0 flex-col gap-1"
                title={STATUS_LABELS[hotkeyStatus[action]]}
              >
                <span className="ui-label">{ACTION_LABELS[action]}</span>
                <span className={`truncate text-[11px] ${statusTone(hotkeyStatus[action])}`}>
                  {hotkeyStatus[action] === 'disabled' ? '—' : settings.bindings[action]}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
