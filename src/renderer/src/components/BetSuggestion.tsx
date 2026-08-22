import { formatCurrency, formatMoney, formatUnits } from '@shared/format'
import type { CurrencySettings } from '@shared/types'

export interface BetSuggestionProps {
  units: number
  /** Valor monetário de 1 unidade; só usado quando showCurrency. */
  unitValue: number
  currency: CurrencySettings
  showCurrency: boolean
  insuranceOn: boolean
  /** EV da mão em unidades. null quando o sistema não tem modelo de vantagem. */
  evPerHandUnits: number | null
  /** Overlay: mesma caixa, padding e fonte menores. */
  compact?: boolean
}

export function BetSuggestion({
  units,
  unitValue,
  currency,
  showCurrency,
  insuranceOn,
  evPerHandUnits,
  compact = false
}: BetSuggestionProps) {
  const value = showCurrency ? formatCurrency(units, unitValue, currency) : formatUnits(units)
  const ev =
    evPerHandUnits === null
      ? null
      : showCurrency
        ? formatMoney(evPerHandUnits * unitValue, currency)
        : formatUnits(evPerHandUnits)

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
      <div className="flex items-baseline justify-between gap-2">
        <span
          className={`tnum font-semibold leading-none ${compact ? 'mt-1.5 text-[18px]' : 'mt-2 text-[26px]'}`}
        >
          {value}
        </span>
        {ev !== null && (
          <span
            className={`tnum ${evPerHandUnits !== null && evPerHandUnits > 0 ? 'text-pos' : 'text-muted'} ${
              compact ? 'text-[10px]' : 'text-[11px]'
            }`}
            title="Valor esperado desta mão com a vantagem atual"
          >
            EV {ev}
          </span>
        )}
      </div>
    </div>
  )
}
