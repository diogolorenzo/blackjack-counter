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
  /**
   * `dealerFirst` é opcional: um reset comum (nova mão) mantém a ordem
   * atual; só a troca de ajuste precisa informar a ordem nova.
   */
  | { type: 'reset'; dealerFirst?: boolean }

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
    case 'stand':
      return finishActive(state, 'stood')
    case 'double':
      return startDouble(state)
    case 'split':
      return split(state)
    case 'undo':
      return undo(state)
    case 'reset':
      return initialRound(action.dealerFirst ?? state.dealerFirst)
    default:
      return state
  }
}

/**
 * Volta um passo. A entrada do topo foi guardada com `past` vazio, então o
 * histórico restante é recolocado aqui — é isso que faz desfazer funcionar
 * várias vezes seguidas sem a pilha crescer em O(n²).
 */
function undo(state: RoundState): RoundState {
  const previous = state.past[state.past.length - 1]
  if (previous === undefined) return state
  return { ...previous, past: state.past.slice(0, -1) }
}

/**
 * Marca a mão ativa como dobrando. Ela continua ativa porque ainda falta a
 * carta; quem encerra é o `addCard` seguinte.
 */
function startDouble(state: RoundState): RoundState {
  if (state.step !== 'playing') return state
  const hand = state.hands[state.activeIndex]
  if (hand.cards.length !== 2 || hand.doubling) return state
  return commit(state, {
    ...state,
    hands: state.hands.map((item, index) =>
      index === state.activeIndex ? { ...item, doubling: true } : item
    )
  })
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

  if (state.step !== 'playing') return state

  const hand = state.hands[state.activeIndex]
  const cards = [...hand.cards, rank]
  const value = handValue(cards, hand.fromSplit)

  const status: HandStatus = value.busted
    ? 'busted'
    : hand.doubling
      ? 'doubled'
      : hand.splitAces || value.total === 21
        ? 'stood'
        : 'active'

  const hands = state.hands.map((item, index) =>
    index === state.activeIndex ? { ...item, cards, status } : item
  )

  return commit(state, status === 'active' ? { ...state, hands } : advance({ ...state, hands }))
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

/**
 * Separa a mão ativa em duas, uma carta em cada, e joga a primeira.
 *
 * As mãos novas entram no lugar da original em vez de irem para o fim da lista:
 * a ordem da tira na tela é a ordem em que as mãos são jogadas na mesa, e
 * empilhar no fim inverteria isso numa re-separação.
 *
 * `splitAces` é herdado por ambas: um ás separado recebe uma carta e encerra,
 * então re-separar ases nunca chega a ser oferecido.
 */
function split(state: RoundState): RoundState {
  if (state.step !== 'playing') return state
  if (state.hands.length >= MAX_HANDS) return state

  const hand = state.hands[state.activeIndex]
  const [first, second] = hand.cards
  if (hand.cards.length !== 2 || first !== second) return state

  const splitAces = hand.splitAces || first === 'A'
  const base = { fromSplit: true, splitAces, doubling: false }
  const left: PlayerHand = { ...hand, ...base, id: `${hand.id}a`, cards: [first], status: 'active' }
  const right: PlayerHand = {
    ...hand,
    ...base,
    id: `${hand.id}b`,
    cards: [second],
    status: 'pending'
  }

  return commit(state, {
    ...state,
    hands: [
      ...state.hands.slice(0, state.activeIndex),
      left,
      right,
      ...state.hands.slice(state.activeIndex + 1)
    ]
  })
}

/** Encerra a mão ativa com este desfecho e passa para a próxima. */
function finishActive(state: RoundState, status: HandStatus): RoundState {
  if (state.step !== 'playing') return state
  const hands = state.hands.map((item, index) =>
    index === state.activeIndex ? { ...item, status } : item
  )
  return commit(state, advance({ ...state, hands }))
}

/**
 * Ativa a próxima mão pendente. Sem nenhuma, a rodada acabou.
 *
 * A busca varre do começo e não a partir do índice ativo: com separação
 * aninhada as mãos novas entram no meio da lista, e uma busca só para a frente
 * pularia uma mão que nasceu antes da atual.
 */
function advance(state: Omit<RoundState, 'past'>): Omit<RoundState, 'past'> {
  const next = state.hands.findIndex((hand) => hand.status === 'pending')
  if (next === -1) return { ...state, step: 'done' }
  return {
    ...state,
    hands: state.hands.map((hand, index) =>
      index === next ? { ...hand, status: 'active' } : hand
    ),
    activeIndex: next,
    step: 'playing'
  }
}
