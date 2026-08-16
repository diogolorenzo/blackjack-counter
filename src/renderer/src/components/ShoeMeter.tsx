import { formatDecks } from '@shared/format'

export interface ShoeMeterProps {
  cardsSeen: number
  totalCards: number
  decksRemaining: number
  /** 0..1 — posição do marcador de corte na barra. */
  penetration: number
  penetrationReached: boolean
  /** Overlay: só barra e decks, sem a contagem de cartas. */
  compact?: boolean
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.min(100, Math.max(0, value))
}

export function ShoeMeter({
  cardsSeen,
  totalCards,
  decksRemaining,
  penetration,
  penetrationReached,
  compact = false
}: ShoeMeterProps) {
  const seenPercent = clampPercent(totalCards > 0 ? (cardsSeen / totalCards) * 100 : 0)
  const markerPercent = clampPercent(penetration * 100)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={`ui-label ${compact ? 'text-[9px]' : ''}`}>Shoe</span>
        <span
          className={`tnum transition-colors duration-100 ${
            penetrationReached ? 'text-warn' : 'text-muted'
          } ${compact ? 'text-[11px]' : 'text-xs'}`}
        >
          {formatDecks(decksRemaining)} decks
        </span>
      </div>

      <div
        className={`relative w-full overflow-hidden rounded-full bg-border ${
          compact ? 'h-1' : 'h-1.5'
        }`}
      >
        <div
          className={`h-full transition-colors duration-100 ${
            penetrationReached ? 'bg-warn' : 'bg-muted'
          }`}
          style={{ width: `${seenPercent}%` }}
        />
        <div
          className="absolute top-0 h-full w-px bg-fg/60"
          style={{ left: `${markerPercent}%` }}
        />
      </div>

      {!compact && (
        <div className="tnum text-[11px] text-muted">
          {cardsSeen} / {totalCards} cartas
        </div>
      )}
    </div>
  )
}
