import { formatCurrency, formatUnits } from '@shared/format'

export interface BetSuggestionProps {
  units: number
  /** Valor monetário de 1 unidade; só usado quando showCurrency. */
  unitValue: number
  showCurrency: boolean
  insuranceOn: boolean
  /** Overlay: mesma caixa, padding e fonte menores. */
  compact?: boolean
}

export function BetSuggestion({
  units,
  unitValue,
  showCurrency,
  insuranceOn,
  compact = false
}: BetSuggestionProps) {
  const value = showCurrency ? formatCurrency(units, unitValue) : formatUnits(units)

  return (
    <div
      className={`rounded-lg border transition-colors duration-100 ${
        insuranceOn ? 'border-warn/50 bg-warn/10' : 'border-border bg-surface'
      } ${compact ? 'px-2 py-1.5' : 'px-3 py-2'}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`ui-label ${compact ? 'text-[9px]' : ''}`}>Bet</span>
        {insuranceOn && (
          <span className={`ui-label text-warn ${compact ? 'text-[9px]' : ''}`}>Insurance</span>
        )}
      </div>
      <div
        className={`tnum font-semibold leading-none ${compact ? 'mt-1.5 text-[18px]' : 'mt-2 text-[26px]'}`}
      >
        {value}
      </div>
    </div>
  )
}
