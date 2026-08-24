import type { HandDecision } from '@shared/domain/handDecision'
import { PLAY_LABELS } from '@shared/domain/deviations'
import type { PlayAction } from '@shared/domain/deviations'
import { formatSigned } from '@shared/format'

export interface DecisionPanelProps {
  decision: HandDecision
  /** Mostra a linha de índice e distância sob a jogada. */
  showReason: boolean
  decisionCount: number
  onHit: () => void
  onStand: () => void
  onDouble: () => void
  onSplit: () => void
  onSurrender: () => void
}

/** Mesma paleta da matriz: o olho procura a cor e lê a palavra depois. */
const ACTION_TONE: Record<PlayAction, string> = {
  hit: 'text-fg',
  stand: 'text-fg',
  double: 'text-warn',
  split: 'text-pos',
  surrender: 'text-neg',
  insurance: 'text-warn',
  noInsurance: 'text-muted'
}

export function DecisionPanel({
  decision,
  showReason,
  decisionCount,
  onHit,
  onStand,
  onDouble,
  onSplit,
  onSurrender
}: DecisionPanelProps) {
  const { action, deviated, index, canDouble, canSplit, canSurrender } = decision

  const reason =
    !deviated || index === null
      ? 'básica'
      : `desvio · índice ${formatSigned(index)} · você está em ${formatSigned(decisionCount)}`

  return (
    <div className="flex flex-col gap-1.5">
      <div
        data-testid="decision"
        className={`rounded-md border px-2 py-1.5 text-center text-[17px] font-semibold uppercase ${
          deviated ? 'border-pos bg-pos/15 text-pos' : `border-border bg-surface ${ACTION_TONE[action]}`
        }`}
      >
        {PLAY_LABELS[action]}
      </div>

      {showReason && (
        <p data-testid="reason" className="tnum text-center text-[10px] leading-snug text-muted">
          {reason}
        </p>
      )}

      <div className="grid grid-cols-2 gap-1">
        <Action label="Pedir" onClick={onHit} />
        <Action label="Ficar" onClick={onStand} />
        {canDouble && <Action label="Dobrar" onClick={onDouble} />}
        {canSplit && <Action label="Separar" onClick={onSplit} />}
        {canSurrender && <Action label="Render" onClick={onSurrender} />}
      </div>
    </div>
  )
}

function Action({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[4px] border border-border bg-surface py-1 text-[11px] text-fg transition-colors duration-100 hover:border-muted hover:bg-fg/10"
    >
      {label}
    </button>
  )
}
