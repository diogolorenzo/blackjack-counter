import { RANKS } from '@shared/domain/hand'
import type { Rank } from '@shared/domain/hand'
import type { KeypadDensity } from '@shared/types'

export interface RankKeypadProps {
  onPick: (rank: Rank) => void
  density: KeypadDensity
}

/**
 * Teclado de dez ranks, em grade 5x2.
 *
 * São `<button>` de verdade, o que os tira do arrasto da janela pela regra
 * `.app-drag button { -webkit-app-region: no-drag }`. Com dez teclas grandes
 * sobra moldura suficiente para arrastar — ao contrário das ~270 células da
 * matriz, que foi o que motivou aquela regra virar um problema.
 */
export function RankKeypad({ onPick, density }: RankKeypadProps) {
  const compact = density === 'compact'

  return (
    <div className={`grid grid-cols-5 ${compact ? 'gap-[2px]' : 'gap-1'}`}>
      {RANKS.map((rank) => (
        <button
          key={rank}
          type="button"
          aria-label={`carta ${rank}`}
          onClick={() => onPick(rank)}
          className={`tnum rounded-[4px] border border-border bg-surface font-semibold text-fg transition-colors duration-100 hover:border-muted hover:bg-fg/10 ${
            compact ? 'h-5 text-[11px]' : 'h-7 text-[13px]'
          }`}
        >
          {rank}
        </button>
      ))}
    </div>
  )
}
