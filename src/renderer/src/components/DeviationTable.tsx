import { useMemo } from 'react'

import {
  PLAY_LABELS,
  currentPlay,
  deviationsForSystem,
  isDeviationActive,
  sortForCount
} from '@shared/domain/deviations'
import type { Deviation } from '@shared/domain/deviations'
import { formatSigned } from '@shared/format'
import type { CountingSystem, DeviationsLayout } from '@shared/types'

import { StrategyMatrix } from '@/components/StrategyMatrix'

export interface DeviationTableProps {
  system: CountingSystem
  /** True count arredondado — o mesmo número que indexa o bet spread. */
  decisionCount: number
  layout: DeviationsLayout
  surrender: boolean
  insuranceOn: boolean
  onLayoutChange: (layout: DeviationsLayout) => void
}

const LAYOUTS: readonly { value: DeviationsLayout; label: string }[] = [
  { value: 'list', label: 'Lista' },
  { value: 'matrix', label: 'Mão × dealer' }
]

function Row({ deviation, count }: { deviation: Deviation; count: number }) {
  const active = isDeviationActive(deviation, count)
  const play = currentPlay(deviation, count)

  return (
    <li
      className={`flex items-center gap-2 rounded-md border px-2 py-1.5 transition-colors duration-100 ${
        active ? 'border-pos/40 bg-pos/10' : 'border-border bg-surface'
      }`}
    >
      <span className="tnum w-[74px] shrink-0 text-[12px]">
        {deviation.hand}
        <span className="text-muted"> vs </span>
        {deviation.upcard}
      </span>

      <span className={`tnum w-9 shrink-0 text-[11px] ${active ? 'text-pos' : 'text-muted'}`}>
        {formatSigned(deviation.index)}
      </span>

      <span
        className={`flex-1 truncate text-right text-[12px] ${active ? 'font-semibold text-pos' : 'text-muted'}`}
      >
        {PLAY_LABELS[play]}
      </span>
    </li>
  )
}

function DeviationList({ system, count }: { system: CountingSystem; count: number }) {
  const rows = useMemo(() => sortForCount(deviationsForSystem(system), count), [system, count])
  const active = rows.filter((row) => isDeviationActive(row, count))

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="ui-label">
          {active.length} de {rows.length} valendo
        </span>
        <span className="tnum text-[12px] text-muted">TC {formatSigned(count)}</span>
      </div>

      <ul className="flex flex-col gap-1">
        {rows.map((row) => (
          <Row key={row.id} deviation={row} count={count} />
        ))}
      </ul>

      <p className="text-[10px] leading-snug text-muted">
        Índices de Hi-Lo para 6 baralhos, S17, DAS e rendição tardia. A coluna do meio é o true count
        a partir do qual a jogada muda; abaixo dele vale a estratégia básica. Regras diferentes
        deslocam alguns índices em até um ponto.
      </p>
    </div>
  )
}

/**
 * Desvios reagindo ao count atual, em duas leituras.
 *
 * A LISTA responde "o que mudou agora" — é a leitura de quem já sabe a
 * estratégia básica e só precisa das exceções. A MATRIZ responde "o que eu faço
 * com esta mão contra esta carta", que é a pergunta que se tem na mesa com a
 * mão na frente. As duas saem do mesmo count; muda só por onde se entra.
 */
export function DeviationTable({
  system,
  decisionCount,
  layout,
  surrender,
  insuranceOn,
  onLayoutChange
}: DeviationTableProps) {
  if (deviationsForSystem(system).length === 0) {
    return (
      <p className="rounded-md border border-border bg-surface px-2.5 py-2 text-[11px] leading-snug text-muted">
        Os índices publicados são de Hi-Lo. O KO usa outra escala (running count em torno do pivô) e
        reaproveitar estes números daria conselho errado com cara de certo.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex overflow-hidden rounded-md border border-border">
        {LAYOUTS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={layout === option.value}
            onClick={() => onLayoutChange(option.value)}
            className={`flex-1 px-2 py-1 text-[11px] transition-colors duration-100 ${
              layout === option.value ? 'bg-fg/10 text-fg' : 'text-muted hover:text-fg'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {layout === 'matrix' ? (
        <StrategyMatrix
          decisionCount={decisionCount}
          surrender={surrender}
          insuranceOn={insuranceOn}
        />
      ) : (
        <DeviationList system={system} count={decisionCount} />
      )}
    </div>
  )
}
