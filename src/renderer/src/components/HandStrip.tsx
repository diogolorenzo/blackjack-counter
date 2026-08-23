import { handValue } from '@shared/domain/hand'
import type { PlayerHand } from '@shared/domain/round'

export interface HandStripProps {
  hands: readonly PlayerHand[]
  activeIndex: number
}

const MARK: Record<PlayerHand['status'], string> = {
  pending: '—',
  active: '',
  stood: '✓',
  busted: '✗',
  doubled: '2x',
  blackjack: 'BJ'
}

/**
 * Uma linha por mão depois de uma separação, na ordem em que serão jogadas.
 *
 * Só aparece com mais de uma mão: com uma só, a tira repetiria o que o bloco de
 * decisão já mostra logo abaixo.
 */
export function HandStrip({ hands, activeIndex }: HandStripProps) {
  return (
    <ul className="flex flex-wrap gap-1" data-testid="hand-strip">
      {hands.map((hand, index) => {
        const total = hand.cards.length === 0 ? '' : handValue(hand.cards, hand.fromSplit).total
        const active = index === activeIndex

        return (
          <li
            key={hand.id}
            className={`tnum rounded-[3px] border px-1 py-[1px] text-[10px] ${
              active ? 'border-pos bg-pos/15 text-pos' : 'border-border bg-surface text-muted'
            }`}
          >
            {index + 1}: {total} {MARK[hand.status]}
          </li>
        )
      })}
    </ul>
  )
}
