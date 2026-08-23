/**
 * Valor de uma mão a partir de ranks clicados no overlay de jogada.
 *
 * J, Q e K não existem aqui: entram como '10'. Para a jogada só o valor
 * importa, e a contagem é alimentada em separado pelas hotkeys — este módulo
 * nunca toca no count.
 */

export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10'

/** Ordem do teclado: o ás primeiro porque é a carta mais consultada. */
export const RANKS: readonly Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10']

export interface HandValue {
  /** Melhor total que não estoura; quando todos estouram, o menor possível. */
  total: number
  /** Sobrou um ás valendo 11. */
  soft: boolean
  /** Exatamente duas cartas de mesmo rank. */
  isPair: boolean
  /** Rank do par, quando `isPair`. É o que a linha `pair-*` precisa saber. */
  pairRank: Rank | null
  busted: boolean
  /** 21 nas duas primeiras cartas, e a mão não veio de separação. */
  blackjack: boolean
}

export function handValue(cards: readonly Rank[], fromSplit = false): HandValue {
  let total = 0
  let acesAsEleven = 0

  for (const card of cards) {
    if (card === 'A') {
      acesAsEleven += 1
      total += 11
    } else {
      total += Number(card)
    }
  }

  // Rebaixa um ás por vez, só o necessário para não estourar.
  while (total > 21 && acesAsEleven > 0) {
    total -= 10
    acesAsEleven -= 1
  }

  const isPair = cards.length === 2 && cards[0] === cards[1]

  return {
    total,
    soft: acesAsEleven > 0,
    isPair,
    pairRank: isPair ? (cards[0] as Rank) : null,
    busted: total > 21,
    blackjack: !fromSplit && cards.length === 2 && total === 21
  }
}
