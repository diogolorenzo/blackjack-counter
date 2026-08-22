import { bucketRankLabel } from '@shared/domain/system'
import { deltaToBucket, formatSigned } from '@shared/format'
import type { CountingSystem, Delta, Entry } from '@shared/types'

export interface HistoryStripProps {
  /** Mais recentes primeiro — a ordem que o snapshot já entrega. */
  entries: readonly Entry[]
  /** overlay.historyLength. */
  limit: number
  /** As cartas de cada bucket mudam com o sistema (o 7 troca de lado no KO). */
  system: CountingSystem
  /** Overlay: chips menores. */
  compact?: boolean
}

function chipTone(delta: Delta): string {
  if (delta === 1) return 'border-pos/30 bg-pos/15 text-pos'
  if (delta === -1) return 'border-neg/30 bg-neg/15 text-neg'
  return 'border-border bg-surface text-muted'
}

export function HistoryStrip({ entries, limit, system, compact = false }: HistoryStripProps) {
  const visible = entries.slice(0, Math.max(0, limit))
  const chipSize = compact ? 'h-4 min-w-[20px] px-1 text-[10px]' : 'h-5 min-w-[24px] px-1 text-[11px]'

  return (
    <div className={`flex items-center gap-1 overflow-hidden ${compact ? 'h-4' : 'h-5'}`}>
      {visible.length === 0 ? (
        <span className="ui-label">Sem cartas</span>
      ) : (
        visible.map((entry) => (
          <span
            key={entry.id}
            title={bucketRankLabel(system, deltaToBucket(entry.delta))}
            className={`tnum inline-flex shrink-0 items-center justify-center rounded border font-medium ${chipSize} ${chipTone(
              entry.delta
            )}`}
          >
            {formatSigned(entry.delta)}
          </span>
        ))
      )}
    </div>
  )
}
