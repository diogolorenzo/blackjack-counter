import { useEffect } from 'react'

import { DEFAULT_SETTINGS, OVERLAY_SIZES } from '@shared/defaults'
import { formatCurrency, formatSigned, formatUnits } from '@shared/format'
import { CARDS_PER_DECK } from '@shared/types'
import type { Derived, Entry, OverlaySize } from '@shared/types'

import { BetSuggestion } from '@/components/BetSuggestion'
import { CountDisplay } from '@/components/CountDisplay'
import { HistoryStrip } from '@/components/HistoryStrip'
import { ShoeMeter } from '@/components/ShoeMeter'
import { secondaryCount } from '@/countView'
import { useCounterState } from '@/useCounterState'
import { useFeedback } from '@/useFeedback'

/**
 * Canvas fixo em que o layout é desenhado, depois reduzido/ampliado por `zoom`
 * para caber na janela real.
 *
 * As três janelas de OVERLAY_SIZES têm razão de aspecto quase igual
 * (190/116 = 1.64, 232/150 = 1.55, 288/188 = 1.53), então um único layout serve
 * aos três: só o fator muda. `zoom` (e não `transform: scale`) porque ele entra
 * no layout — o texto continua rasterizado no tamanho final, sem borrar.
 *
 * O empilhamento dos blocos mede ~160px; os 184 do canvas são folga deliberada,
 * que vira respiro nas bordas depois da escala. Sem essa redução o tamanho
 * `small` (116px de altura) cortaria metade do conteúdo — os componentes têm
 * tipografia fixa e não encolhem sozinhos.
 */
const DESIGN_WIDTH = 264
const DESIGN_HEIGHT = 184

/** O layout mínimo tem duas linhas só, então cabe num canvas bem mais baixo. */
const MINIMAL_HEIGHT = 104

/** Cabem ~10 chips em DESIGN_WIDTH; historyLength vai até 16 e transbordaria. */
const MAX_OVERLAY_CHIPS = 9

const NO_ENTRIES: readonly Entry[] = []

/** Primeiro frame: mesma estrutura, valores zerados — o layout não pode piscar. */
const LOADING_DERIVED: Derived = {
  runningCount: 0,
  rawCount: 0,
  cardsSeen: 0,
  totalCards: DEFAULT_SETTINGS.shoe.deckCount * CARDS_PER_DECK,
  cardsRemaining: DEFAULT_SETTINGS.shoe.deckCount * CARDS_PER_DECK,
  decksRemaining: DEFAULT_SETTINGS.shoe.deckCount,
  trueCountExact: 0,
  decisionCount: 0,
  betUnits: 1,
  advantagePct: null,
  evPerHandUnits: null,
  insuranceOn: false,
  penetrationReached: false,
  shoeExhausted: false
}

function contentScale(size: OverlaySize, designHeight: number): number {
  const { width, height } = OVERLAY_SIZES[size]
  return Math.min(width / DESIGN_WIDTH, height / designHeight)
}

/**
 * Travado o overlay é click-through: a borda só delimita, nunca convida ao clique.
 *
 * A borda é o único canal de alerta que não custa layout — o conteúdo já ocupa
 * os 232x150 inteiros. Escalonamento: neutra -> âmbar (insurance) -> vermelha
 * (shoe estourado). Vermelho vence porque, passado o fim do shoe, os baralhos
 * restantes travam no piso e o true count sai inflado: o número mostrado deixa
 * de valer, e isso precisa aparecer mesmo com a janela principal fechada.
 */
function edgeTone(locked: boolean, insuranceOn: boolean, shoeExhausted: boolean): string {
  if (shoeExhausted) return 'border-neg'
  if (insuranceOn) return 'border-warn/60'
  return locked ? 'border-border/70' : 'border-fg/30'
}

export function OverlayApp() {
  const { snapshot } = useCounterState()

  const settings = snapshot?.settings ?? DEFAULT_SETTINGS
  const derived = snapshot?.derived ?? LOADING_DERIVED
  const entries = snapshot?.recentEntries ?? NO_ENTRIES
  const { locked, size, layout, opacity, historyLength, showCurrency } = settings.overlay

  // Escondido, o overlay continua vivo como janela: sem esta condição o tick
  // sairia duas vezes, uma aqui e outra na janela principal.
  const { pulsing } = useFeedback(snapshot, { playSound: settings.overlay.visible })

  useEffect(() => {
    document.body.dataset.palette = settings.palette
  }, [settings.palette])

  const secondary = secondaryCount(derived)
  const minimal = layout === 'minimal'
  const designHeight = minimal ? MINIMAL_HEIGHT : DESIGN_HEIGHT

  return (
    <div
      style={{ ['--overlay-alpha' as string]: String(opacity) }}
      className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-[10px] border bg-overlay backdrop-blur-md transition-colors duration-100 ${edgeTone(
        locked,
        derived.insuranceOn,
        derived.shoeExhausted
      )} ${locked ? '' : 'app-drag cursor-move'} ${pulsing ? 'counter-pulse' : ''}`}
    >
      {!locked && (
        <span
          aria-hidden="true"
          className="absolute top-[3px] left-1/2 h-[2px] w-7 -translate-x-1/2 rounded-full bg-fg/40"
        />
      )}

      <div
        className="flex flex-col gap-1 p-2"
        style={{ width: DESIGN_WIDTH, zoom: contentScale(size, designHeight) }}
      >
        {minimal ? (
          <div className="flex items-end justify-between gap-3">
            <div className="flex flex-col gap-1">
              <span className="ui-label text-[9px]">{secondary.label}</span>
              <span
                className={`tnum text-[46px] font-semibold leading-none tracking-tight ${
                  secondary.tone >= 2 ? 'text-pos' : secondary.tone <= -1 ? 'text-neg' : 'text-fg'
                }`}
              >
                {secondary.value}
              </span>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className="ui-label text-[9px]">
                {derived.insuranceOn ? 'Insurance' : 'Bet'}
              </span>
              <span
                className={`tnum text-[30px] font-semibold leading-none tracking-tight ${
                  derived.insuranceOn ? 'text-warn' : 'text-fg'
                }`}
              >
                {showCurrency
                  ? formatCurrency(derived.betUnits, settings.unitValue, settings.currency)
                  : formatUnits(derived.betUnits)}
              </span>
              <span className="tnum text-[10px] text-muted">
                RC {formatSigned(derived.runningCount)}
              </span>
            </div>
          </div>
        ) : (
          <>
            <CountDisplay
              runningCount={derived.runningCount}
              secondaryLabel={secondary.label}
              secondaryValue={secondary.value}
              secondaryTone={secondary.tone}
              advantagePct={derived.advantagePct}
              compact
            />
            <ShoeMeter
              cardsSeen={derived.cardsSeen}
              totalCards={derived.totalCards}
              decksRemaining={derived.decksRemaining}
              penetration={settings.shoe.penetration}
              penetrationReached={derived.penetrationReached}
              compact
            />
            <BetSuggestion
              units={derived.betUnits}
              unitValue={settings.unitValue}
              currency={settings.currency}
              showCurrency={showCurrency}
              insuranceOn={derived.insuranceOn}
              evPerHandUnits={derived.evPerHandUnits}
              compact
            />
            <HistoryStrip
              entries={entries}
              limit={Math.min(historyLength, MAX_OVERLAY_CHIPS)}
              system={settings.shoe.system}
              compact
            />
          </>
        )}
      </div>
    </div>
  )
}
