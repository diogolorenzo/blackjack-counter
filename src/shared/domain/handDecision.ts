/**
 * Jogada para a mão ativa do overlay.
 *
 * Nada de estratégia é reescrito aqui: `cellDecision` continua sendo a única
 * fonte da jogada. Este módulo é o adaptador entre "cartas na mesa" e "célula
 * da matriz", mais as restrições que a matriz não conhece (já pedi carta, já
 * separei três vezes).
 */
import { basicAction, cellDecision, fallbackAction } from './basicStrategy'
import type { StrategyRules, Upcard } from './basicStrategy'
import type { PlayAction } from './deviations'
import { handRowKey, handValue } from './hand'
import { MAX_HANDS } from './round'
import type { PlayerHand } from './round'

export interface HandDecision {
  action: PlayAction
  /** A contagem mudou esta jogada em relação à básica desta mesa. */
  deviated: boolean
  index: number | null
  distance: number | null
  canDouble: boolean
  canSplit: boolean
  canSurrender: boolean
}

export function decideHand(
  hand: PlayerHand,
  upcard: Upcard,
  decisionCount: number,
  rules: StrategyRules,
  countAware: boolean,
  handCount: number
): HandDecision {
  const value = handValue(hand.cards, hand.fromSplit)
  const twoCards = hand.cards.length === 2

  // Todas já ficam falsas sozinhas quando `value.busted`, então uma mão
  // estourada não precisa de um conjunto de flags à parte.
  const canDouble = twoCards && !value.busted
  const canSplit = twoCards && value.isPair && handCount < MAX_HANDS && !value.busted
  const canSurrender = rules.surrender && twoCards && !hand.fromSplit && !value.busted
  const available = { canDouble, canSplit, canSurrender }

  if (value.busted) {
    return { action: 'stand', deviated: false, index: null, distance: null, ...available }
  }

  const lookup = handRowKey(value, canSplit)

  if (lookup.kind === 'always') {
    return {
      action: lookup.action,
      deviated: false,
      index: null,
      distance: null,
      ...available
    }
  }

  /**
   * `countAware` false = KO. Os índices publicados são de Hi-Lo e a escala do
   * KO é outra, então a decisão cai na básica pura — o mesmo tratamento que
   * StrategyGrid dá à matriz.
   */
  const raw = countAware
    ? cellDecision(lookup.key, upcard, decisionCount, rules)
    : null
  const basic = basicAction(lookup.key, upcard, rules)

  if (basic === null) {
    return { action: 'hit', deviated: false, index: null, distance: null, ...available }
  }

  const restrict = (action: PlayAction): PlayAction => {
    if (action === 'double' && !canDouble) return fallbackAction(action)
    if (action === 'surrender' && !canSurrender) return fallbackAction(action)
    return action
  }

  const action = restrict(raw?.action ?? basic)

  /**
   * `deviated` é recalculado contra a básica JÁ restringida, e não copiado de
   * `cellDecision`. Um desvio que manda dobrar numa mão de três cartas vira
   * pedir — e se a básica também era pedir, nada mudou de fato; marcar como
   * desvio ali destacaria em verde uma jogada idêntica à do livro.
   */
  return {
    action,
    deviated: action !== restrict(basic),
    index: raw?.index ?? null,
    distance: raw?.distance ?? null,
    ...available
  }
}
