import type { HandDecision } from '@shared/domain/handDecision'
import { PLAY_LABELS } from '@shared/domain/deviations'
import type { PlayAction } from '@shared/domain/deviations'
import { formatSigned } from '@shared/format'
import type { DecisionLanguage } from '@shared/types'

export interface DecisionPanelProps {
  decision: HandDecision
  /** Mostra a linha de índice e distância sob a jogada. */
  showReason: boolean
  decisionCount: number
  language: DecisionLanguage
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
  language,
  onHit,
  onStand,
  onDouble,
  onSplit,
  onSurrender
}: DecisionPanelProps) {
  const { action, deviated, index, canDouble, canSplit, canSurrender } = decision
  const labels = PLAY_LABELS[language]

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
        {labels[action]}
      </div>

      {showReason && (
        <p data-testid="reason" className="tnum text-center text-[10px] leading-snug text-muted">
          {reason}
        </p>
      )}

      {/*
        Os botões leem do MESMO mapa que o texto grande acima: era daqui que
        vinha a confusão — "Ficar" no botão e "parar" no texto, a mesma jogada
        com dois nomes na mesma tela, no meio de uma mão.
      */}
      <div className="grid grid-cols-2 gap-1">
        <Action label={labels.hit} onClick={onHit} />
        <Action label={labels.stand} onClick={onStand} />
        {canDouble && <Action label={labels.double} onClick={onDouble} />}
        {canSplit && <Action label={labels.split} onClick={onSplit} />}
        {canSurrender && <Action label={labels.surrender} onClick={onSurrender} />}
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
