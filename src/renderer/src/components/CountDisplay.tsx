import { formatSigned, formatTrueCount } from '@shared/format'

export interface CountDisplayProps {
  runningCount: number
  /** derived.trueCountExact — a formatação de uma casa é feita aqui. */
  trueCount: number
  /** Overlay: mesma informação, tipografia menor. */
  compact?: boolean
}

/** Vantagem do jogador: TC >= +2 é onde a aposta sobe, TC <= -1 é onde se recua. */
function advantageTone(trueCount: number): string {
  if (trueCount >= 2) return 'text-pos'
  if (trueCount <= -1) return 'text-neg'
  return 'text-muted'
}

export function CountDisplay({ runningCount, trueCount, compact = false }: CountDisplayProps) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        <span className={`ui-label ${compact ? 'text-[9px]' : ''}`}>Running</span>
        <span
          className={`tnum font-semibold leading-none tracking-tight ${
            compact ? 'text-[34px]' : 'text-[64px]'
          }`}
        >
          {formatSigned(runningCount)}
        </span>
      </div>

      <div className="flex flex-col items-end gap-1">
        <span className={`ui-label ${compact ? 'text-[9px]' : ''}`}>True</span>
        <span
          className={`tnum font-semibold leading-none tracking-tight transition-colors duration-100 ${advantageTone(
            trueCount
          )} ${compact ? 'text-[20px]' : 'text-[34px]'}`}
        >
          {formatTrueCount(trueCount)}
        </span>
      </div>
    </div>
  )
}
