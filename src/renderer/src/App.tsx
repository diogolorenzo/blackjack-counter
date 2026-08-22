import { useEffect, useState } from 'react'

import { isNumLockDependent } from '@shared/defaults'
import { bucketRankLabel, systemProfile } from '@shared/domain/system'
import { bucketToDelta, formatSigned } from '@shared/format'
import type { DeepPartial } from '@shared/ipc'
import { HOTKEY_ACTIONS } from '@shared/types'
import type { Bucket, HotkeyAction, HotkeyStatus, Settings } from '@shared/types'

import { BetSuggestion } from '@/components/BetSuggestion'
import { CountDisplay } from '@/components/CountDisplay'
import { DeviationTable } from '@/components/DeviationTable'
import { DrillPanel } from '@/components/DrillPanel'
import { HelpPanel } from '@/components/HelpPanel'
import { HistoryPanel } from '@/components/HistoryPanel'
import { HistoryStrip } from '@/components/HistoryStrip'
import { SettingsPanel } from '@/components/SettingsPanel'
import { ShoeMeter } from '@/components/ShoeMeter'
import { TabBar } from '@/components/TabBar'
import type { Tab } from '@/components/TabBar'
import { TitleBar } from '@/components/TitleBar'
import { secondaryCount } from '@/countView'
import { useCounterState } from '@/useCounterState'
import { useFeedback } from '@/useFeedback'

/** Confirmação de "novo shoe" se desarma sozinha: botão armado esquecido é um clique perdido. */
const NEW_SHOE_CONFIRM_MS = 4000

const ACTION_LABELS: Record<HotkeyAction, string> = {
  low: '+1',
  neutral: '0',
  high: '−1',
  undo: 'Undo',
  redo: 'Redo',
  newShoe: 'Shoe',
  toggleOverlay: 'Overlay'
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
  const [tab, setTab] = useState<Tab>('count')
  const [confirmNewShoe, setConfirmNewShoe] = useState(false)

  useNumLockReporter()

  const overlayVisible = snapshot?.settings.overlay.visible ?? false
  // Uma janela só toca o tick, senão vem dobrado: com o overlay à mostra, ele é
  // quem está na frente do jogador.
  const { pulsing } = useFeedback(snapshot, { playSound: !overlayVisible })

  const palette = snapshot?.settings.palette ?? 'default'
  useEffect(() => {
    document.body.dataset.palette = palette
  }, [palette])

  useEffect(() => {
    if (!confirmNewShoe) return
    const timer = window.setTimeout(() => setConfirmNewShoe(false), NEW_SHOE_CONFIRM_MS)
    return () => window.clearTimeout(timer)
  }, [confirmNewShoe])

  if (snapshot === null) {
    return (
      <div className="flex h-full flex-col">
        <TitleBar systemLabel="Hi-Lo" />
        <div className="flex flex-1 items-center justify-center">
          <span className="ui-label">Carregando</span>
        </div>
      </div>
    )
  }

  const { derived, settings, hotkeyStatus } = snapshot
  const profile = systemProfile(settings.shoe.system)
  const secondary = secondaryCount(derived)

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

  const boundActions = HOTKEY_ACTIONS.filter((action) => settings.bindings[action] !== '')

  return (
    <div className="flex h-full flex-col">
      <TitleBar systemLabel={profile.label} />
      <TabBar
        active={tab}
        onSelect={setTab}
        showDeviations={settings.shoe.system === 'hilo'}
        sessionIdle={!snapshot.session.active}
      />

      {snapshot.sessionRestored && (
        <div className="flex items-center gap-2 border-b border-warn/40 bg-warn/10 px-3 py-2 text-[11px] leading-snug text-warn">
          <span className="flex-1">
            Shoe recuperado do encerramento anterior: {derived.cardsSeen} cartas.
          </span>
          <button
            type="button"
            onClick={() => void window.counter.acknowledgeRestore()}
            className="shrink-0 rounded border border-warn/50 px-2 py-0.5 transition-colors duration-100 hover:bg-warn/20"
          >
            Manter
          </button>
          <button
            type="button"
            onClick={() => void window.counter.newShoe()}
            className="shrink-0 rounded border border-warn/50 px-2 py-0.5 transition-colors duration-100 hover:bg-warn/20"
          >
            Descartar
          </button>
        </div>
      )}

      {tab === 'settings' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <SettingsPanel settings={settings} hotkeyStatus={hotkeyStatus} onPatch={patch} />
        </div>
      )}

      {tab === 'deviations' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <DeviationTable
            system={settings.shoe.system}
            decisionCount={derived.decisionCount}
            layout={settings.deviationsLayout}
            surrender={settings.shoe.surrender}
            insuranceOn={derived.insuranceOn}
            onLayoutChange={(deviationsLayout) => patch({ deviationsLayout })}
          />
        </div>
      )}

      {tab === 'drill' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <DrillPanel
            system={settings.shoe.system}
            bindings={settings.bindings}
            feedback={settings.feedback}
          />
        </div>
      )}

      {tab === 'history' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <HistoryPanel
            settings={settings}
            session={snapshot.session}
            shoeStartedAt={snapshot.shoeStats.startedAt}
          />
        </div>
      )}

      {tab === 'help' && (
        <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
          <HelpPanel settings={settings} onNavigate={setTab} />
        </div>
      )}

      {tab === 'count' && (
        <div
          className={`flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 pb-3 pt-2.5 ${
            pulsing ? 'counter-pulse' : ''
          }`}
        >
          <CountDisplay
            runningCount={derived.runningCount}
            secondaryLabel={secondary.label}
            secondaryValue={secondary.value}
            secondaryTone={secondary.tone}
            advantagePct={derived.advantagePct}
          />

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
            currency={settings.currency}
            showCurrency={settings.overlay.showCurrency}
            insuranceOn={derived.insuranceOn}
            evPerHandUnits={derived.evPerHandUnits}
          />

          <HistoryStrip
            entries={snapshot.recentEntries}
            limit={settings.overlay.historyLength}
            system={settings.shoe.system}
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
                    {bucketRankLabel(settings.shoe.system, bucket)}
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
              title="Encerra o shoe atual, grava no histórico e zera a contagem"
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
            {boundActions.map((action) => (
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
