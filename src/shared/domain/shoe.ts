import type { BetSpreadRule, Derived, Entry, ShoeConfig } from '../types'
import { CARDS_PER_DECK } from '../types'
import { INSURANCE_TRUE_COUNT } from '../defaults'
import { lookupUnits } from './betSpread'

/** Piso de emergência (1 carta) para minDecksRemaining inválido — sem ele, 0 ou NaN viraria Infinity/NaN no true count. */
const ABSOLUTE_MIN_DECKS = 1 / CARDS_PER_DECK

/**
 * Todo o cálculo Hi-Lo derivado do histórico. Função pura: mesma entrada, mesma
 * saída, sem estado nem relógio.
 */
export function computeDerived(
  entries: readonly Entry[],
  shoe: ShoeConfig,
  spread: readonly BetSpreadRule[]
): Derived {
  let runningCount = 0
  for (const entry of entries) runningCount += entry.delta

  const totalCards = shoe.deckCount * CARDS_PER_DECK
  const cardsSeen = entries.length
  const cardsRemaining = Math.max(0, totalCards - cardsSeen)

  const minDecks = shoe.minDecksRemaining > 0 ? shoe.minDecksRemaining : ABSOLUTE_MIN_DECKS
  const decksRemaining = Math.max(minDecks, cardsRemaining / CARDS_PER_DECK)

  const trueCountExact = runningCount / decksRemaining
  // floor é o padrão da literatura Hi-Lo: com contagem negativa ele arredonda
  // para BAIXO (-1.2 -> -2), o lado conservador da aposta.
  const trueCountForBets =
    shoe.trueCountRounding === 'floor' ? Math.floor(trueCountExact) : Math.round(trueCountExact)

  return {
    runningCount,
    cardsSeen,
    totalCards,
    cardsRemaining,
    decksRemaining,
    trueCountExact,
    trueCountForBets,
    betUnits: lookupUnits(trueCountForBets, spread),
    insuranceOn: trueCountForBets >= INSURANCE_TRUE_COUNT,
    penetrationReached: cardsSeen >= totalCards * shoe.penetration,
    shoeExhausted: cardsRemaining === 0
  }
}
