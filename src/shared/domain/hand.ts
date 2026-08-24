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

/**
 * Onde a mão é consultada: uma linha da tabela, ou uma resposta direta para as
 * mãos que a tabela não cobre.
 */
export type RowLookup =
  | { kind: 'row'; key: string }
  | { kind: 'always'; action: 'hit' | 'stand' }

/**
 * Chave de linha de `HAND_ROWS` para esta mão.
 *
 * As faixas fora da tabela não são omissão dela: abaixo de 8 duro pedir é
 * sempre certo, de 18 duro e 20 mole para cima ficar é sempre certo, e mole de
 * 12 só existe como A,A que não pôde ser separado. Responder direto é mais
 * barato e mais correto que inventar linhas.
 *
 * `canSplit` false força a leitura pela mão dura/mole equivalente: um 8,8 no
 * limite de mãos é `hard-16`, não `pair-8`.
 *
 * Pré-condição: mão não estourada. Quem chama (`decideHand`) trata o estouro
 * antes, porque mão estourada não tem jogada, e não uma jogada padrão.
 */
export function handRowKey(value: HandValue, canSplit: boolean): RowLookup {
  if (canSplit && value.isPair && value.pairRank !== null) {
    return { kind: 'row', key: `pair-${value.pairRank}` }
  }

  if (value.soft) {
    if (value.total >= 20) return { kind: 'always', action: 'stand' }
    if (value.total <= 12) return { kind: 'always', action: 'hit' }
    return { kind: 'row', key: `soft-${value.total}` }
  }

  if (value.total <= 7) return { kind: 'always', action: 'hit' }
  if (value.total >= 18) return { kind: 'always', action: 'stand' }
  return { kind: 'row', key: `hard-${value.total}` }
}
