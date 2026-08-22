import { formatPercent, formatSigned } from '@shared/format'

export interface CountDisplayProps {
  runningCount: number
  /** Segundo número já formatado: true count no Hi-Lo, distância do pivô no KO. */
  secondaryLabel: string
  secondaryValue: string
  /** Número que decide a cor do secundário. */
  secondaryTone: number
  /** Vantagem em pontos percentuais. null esconde a linha. */
  advantagePct: number | null
  /** Overlay: mesma informação, tipografia menor. */
  compact?: boolean
}

/** Vantagem do jogador: +2 é onde a aposta sobe, -1 é onde se recua. */
function advantageTone(count: number): string {
  if (count >= 2) return 'text-pos'
  if (count <= -1) return 'text-neg'
  return 'text-muted'
}

export function CountDisplay({
  runningCount,
  secondaryLabel,
  secondaryValue,
  secondaryTone,
  advantagePct,
  compact = false
}: CountDisplayProps) {
  return (
    <div className="flex flex-col gap-1">
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
          <span className={`ui-label ${compact ? 'text-[9px]' : ''}`}>{secondaryLabel}</span>
          <span
            className={`tnum font-semibold leading-none tracking-tight transition-colors duration-100 ${advantageTone(
              secondaryTone
            )} ${compact ? 'text-[20px]' : 'text-[34px]'}`}
          >
            {secondaryValue}
          </span>
        </div>
      </div>

      {advantagePct !== null && (
        <div className="flex items-baseline justify-between gap-2">
          <span className={`ui-label ${compact ? 'text-[9px]' : ''}`}>Vantagem</span>
          <span
            className={`tnum transition-colors duration-100 ${
              advantagePct > 0 ? 'text-pos' : 'text-muted'
            } ${compact ? 'text-[10px]' : 'text-[12px]'}`}
          >
            {formatPercent(advantagePct)}
          </span>
        </div>
      )}
    </div>
  )
}
