/**
 * Estado de uma rodada no overlay de jogada.
 *
 * Reducer puro e não `useState` na tela porque, com separação, o número de
 * transições (qual mão está ativa, quando dobrar deixa de ser possível, ases
 * separados que recebem uma carta só) passa do ponto em que dá para verificar
 * clicando.
 *
 * Nada aqui toca na contagem: o clique de rank informa a mão, e o count segue
 * vindo das hotkeys. São duas portas independentes de propósito — bug no fluxo
 * de mão não pode corromper uma sessão de banca.
 */
import type { Upcard } from './basicStrategy'
import { handValue } from './hand'
import type { Rank } from './hand'

/** Três separações. Regra da esmagadora maioria das mesas. */
export const MAX_HANDS = 4

export type RoundStep = 'player' | 'dealer' | 'playing' | 'done'

export type HandStatus =
  | 'pending'
  | 'active'
  | 'stood'
  | 'busted'
  | 'doubled'
  | 'blackjack'

export interface PlayerHand {
  id: string
  cards: Rank[]
  status: HandStatus
  /** Veio de separação: não tem blackjack natural. */
  fromSplit: boolean
  /** Ases separados: recebe uma carta e encerra, regra padrão de cassino. */
  splitAces: boolean
  /** Dobrou: a próxima carta encerra a mão. */
  doubling: boolean
}

export interface RoundState {
  step: RoundStep
  hands: PlayerHand[]
  activeIndex: number
  upcard: Upcard | null
  /** Pedir o upcard antes das cartas do jogador. Preferência do usuário. */
  dealerFirst: boolean
  /**
   * Pilha de desfazer. Cada entrada é um estado anterior com `past` vazio; o
   * histórico completo é reconstruído no `undo`, que devolve a entrada do topo
   * já com o resto da pilha. Guardar `past` dentro de `past` faria a estrutura
   * crescer em O(n²) ao longo da rodada.
   */
  past: RoundState[]
}

export type RoundAction =
  | { type: 'addCard'; rank: Rank }
  | { type: 'stand' }
  | { type: 'double' }
  | { type: 'split' }
  | { type: 'undo' }
  | { type: 'reset' }

export function initialRound(dealerFirst: boolean): RoundState {
  return {
    step: dealerFirst ? 'dealer' : 'player',
    hands: [
      { id: 'h', cards: [], status: 'active', fromSplit: false, splitAces: false, doubling: false }
    ],
    activeIndex: 0,
    upcard: null,
    dealerFirst,
    past: []
  }
}

/** Empilha o estado atual antes de aplicar o próximo. */
function commit(previous: RoundState, next: Omit<RoundState, 'past'>): RoundState {
  return { ...next, past: [...previous.past, { ...previous, past: [] }] }
}

export function roundReducer(state: RoundState, action: RoundAction): RoundState {
  switch (action.type) {
    case 'addCard':
      return addCard(state, action.rank)
    default:
      return state
  }
}

function addCard(state: RoundState, rank: Rank): RoundState {
  if (state.step === 'dealer') {
    const upcard = rank as Upcard
    const dealt = state.hands[0].cards.length === 2
    const next: Omit<RoundState, 'past'> = {
      ...state,
      upcard,
      step: dealt ? 'playing' : 'player'
    }
    return commit(state, next.step === 'playing' ? openPlay(next) : next)
  }

  if (state.step === 'player') {
    const hand = state.hands[0]
    const cards = [...hand.cards, rank]
    const complete = cards.length === 2
    const next: Omit<RoundState, 'past'> = {
      ...state,
      hands: [{ ...hand, cards }],
      step: complete ? (state.upcard === null ? 'dealer' : 'playing') : 'player'
    }
    return commit(state, next.step === 'playing' ? openPlay(next) : next)
  }

  return state
}

/**
 * Entrada em `playing`. Blackjack natural não tem jogada: a mão já nasce
 * encerrada, e sem isso o overlay ofereceria "pedir" numa mão de 21.
 */
function openPlay(state: Omit<RoundState, 'past'>): Omit<RoundState, 'past'> {
  const hand = state.hands[0]
  if (!handValue(hand.cards, hand.fromSplit).blackjack) return state
  return {
    ...state,
    hands: [{ ...hand, status: 'blackjack' }],
    step: 'done'
  }
}
