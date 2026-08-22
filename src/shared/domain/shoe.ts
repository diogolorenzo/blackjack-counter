import type { BetSpreadRule, Derived, Entry, ShoeConfig } from '../types'
import { CARDS_PER_DECK } from '../types'
import { lookupUnits } from './betSpread'
import { advantagePct, initialRunningCount, systemProfile } from './system'

/** Piso de emergência (1 carta) para minDecksRemaining inválido — sem ele, 0 ou NaN viraria Infinity/NaN no true count. */
const ABSOLUTE_MIN_DECKS = 1 / CARDS_PER_DECK

/**
 * Todo o cálculo derivado do histórico. Função pura: mesma entrada, mesma
 * saída, sem estado nem relógio.
 *
 * O sistema de contagem entra aqui em três pontos e só neles: o IRC somado ao
 * running count, a divisão (ou não) por baralhos restantes, e o índice de
 * insurance.
 */
export function computeDerived(
  entries: readonly Entry[],
  shoe: ShoeConfig,
  spread: readonly BetSpreadRule[]
): Derived {
  let rawCount = 0
  for (const entry of entries) rawCount += entry.delta

  const profile = systemProfile(shoe.system)
  const runningCount = initialRunningCount(shoe.system, shoe.deckCount) + rawCount

  const totalCards = shoe.deckCount * CARDS_PER_DECK
  const cardsSeen = entries.length
  const cardsRemaining = Math.max(0, totalCards - cardsSeen)

  const minDecks = shoe.minDecksRemaining > 0 ? shoe.minDecksRemaining : ABSOLUTE_MIN_DECKS
  const decksRemaining = Math.max(minDecks, cardsRemaining / CARDS_PER_DECK)

  // Sistema desbalanceado não pode ser dividido por baralhos: o IRC embutido no
  // running count não é uma contagem de cartas, e dividi-lo produziria um
  // número sem significado que ainda assim pareceria um true count.
  const trueCountExact = profile.balanced ? runningCount / decksRemaining : null

  // floor é o padrão da literatura Hi-Lo: com contagem negativa ele arredonda
  // para BAIXO (-1.2 -> -2), o lado conservador da aposta.
  const decisionCount =
    trueCountExact === null
      ? runningCount
      : shoe.trueCountRounding === 'floor'
        ? Math.floor(trueCountExact)
        : Math.round(trueCountExact)

  const betUnits = lookupUnits(decisionCount, spread)
  const advantage = advantagePct(shoe.system, trueCountExact)

  return {
    runningCount,
    rawCount,
    cardsSeen,
    totalCards,
    cardsRemaining,
    decksRemaining,
    trueCountExact,
    decisionCount,
    betUnits,
    advantagePct: advantage,
    // Vantagem em pontos percentuais sobre a aposta: 1% de 8 unidades = 0.08 unidade.
    evPerHandUnits: advantage === null ? null : (betUnits * advantage) / 100,
    insuranceOn: decisionCount >= profile.insuranceIndex,
    penetrationReached: cardsSeen >= totalCards * shoe.penetration,
    shoeExhausted: cardsRemaining === 0
  }
}
