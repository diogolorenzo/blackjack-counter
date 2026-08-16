import { DEFAULT_SETTINGS, OVERLAY_SIZES } from '@shared/defaults'
import { CARDS_PER_DECK } from '@shared/types'
import type { Derived, Entry, OverlaySize } from '@shared/types'
import { BetSuggestion } from '@/components/BetSuggestion'
import { CountDisplay } from '@/components/CountDisplay'
import { HistoryStrip } from '@/components/HistoryStrip'
import { ShoeMeter } from '@/components/ShoeMeter'
import { useCounterState } from '@/useCounterState'

/**
 * Canvas fixo em que o layout é desenhado, depois reduzido/ampliado por `zoom`
 * para caber na janela real.
 *
 * As três janelas de OVERLAY_SIZES têm razão de aspecto quase igual
 * (190/116 = 1.64, 232/150 = 1.55, 288/188 = 1.53), então um único layout serve
 * aos três: só o fator muda. `zoom` (e não `transform: scale`) porque ele entra
 * no layout — o texto continua rasterizado no tamanho final, sem borrar.
 *
 * O empilhamento dos quatro blocos mede ~150px; os 176 do canvas são folga
 * deliberada, que vira respiro nas bordas depois da escala. Sem essa redução o
 * tamanho `small` (116px de altura) cortaria metade do conteúdo — os componentes
 * têm tipografia fixa e não encolhem sozinhos.
 */
const DESIGN_WIDTH = 264
const DESIGN_HEIGHT = 176

/** Cabem ~10 chips em DESIGN_WIDTH; historyLength vai até 16 e transbordaria. */
const MAX_OVERLAY_CHIPS = 9

const NO_ENTRIES: readonly Entry[] = []

/** Primeiro frame: mesma estrutura, valores zerados — o layout não pode piscar. */
const LOADING_DERIVED: Derived = {
  runningCount: 0,
  cardsSeen: 0,
  totalCards: DEFAULT_SETTINGS.shoe.deckCount * CARDS_PER_DECK,
  cardsRemaining: DEFAULT_SETTINGS.shoe.deckCount * CARDS_PER_DECK,
  decksRemaining: DEFAULT_SETTINGS.shoe.deckCount,
  trueCountExact: 0,
  trueCountForBets: 0,
  betUnits: 1,
  insuranceOn: false,
  penetrationReached: false,
  shoeExhausted: false
}

function contentScale(size: OverlaySize): number {
  const { width, height } = OVERLAY_SIZES[size]
  return Math.min(width / DESIGN_WIDTH, height / DESIGN_HEIGHT)
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
  const { locked, size, historyLength, showCurrency } = settings.overlay

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden rounded-[10px] border bg-overlay backdrop-blur-md transition-colors duration-100 ${edgeTone(
        locked,
        derived.insuranceOn,
        derived.shoeExhausted
      )} ${locked ? '' : 'app-drag cursor-move'}`}
    >
      {!locked && (
        <span
          aria-hidden="true"
          className="absolute top-[3px] left-1/2 h-[2px] w-7 -translate-x-1/2 rounded-full bg-fg/40"
        />
      )}

      <div
        className="flex flex-col gap-1 p-2"
        style={{ width: DESIGN_WIDTH, zoom: contentScale(size) }}
      >
        <CountDisplay
          runningCount={derived.runningCount}
          trueCount={derived.trueCountExact}
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
          showCurrency={showCurrency}
          insuranceOn={derived.insuranceOn}
          compact
        />
        <HistoryStrip
          entries={entries}
          limit={Math.min(historyLength, MAX_OVERLAY_CHIPS)}
          compact
        />
      </div>
    </div>
  )
}
