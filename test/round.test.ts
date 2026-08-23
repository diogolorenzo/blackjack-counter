import { describe, expect, it } from 'vitest'

import { UPCARDS } from '../src/shared/domain/basicStrategy'
import type { Rank } from '../src/shared/domain/hand'
import { RANKS } from '../src/shared/domain/hand'
import { MAX_HANDS, initialRound, roundReducer } from '../src/shared/domain/round'
import type { RoundAction, RoundState } from '../src/shared/domain/round'

const play = (state: RoundState, ...actions: RoundAction[]): RoundState =>
  actions.reduce(roundReducer, state)

const card = (rank: Rank): RoundAction => ({
  type: 'addCard',
  rank
})

const opened = (...cards: Parameters<typeof card>[0][]) =>
  play(initialRound(false), ...cards.map(card))

describe('abertura da rodada', () => {
  it('começa pedindo a mão do jogador', () => {
    const state = initialRound(false)
    expect(state.step).toBe('player')
    expect(state.hands).toHaveLength(1)
    expect(state.hands[0].cards).toEqual([])
  })

  it('com dealerFirst começa pedindo o upcard', () => {
    expect(initialRound(true).step).toBe('dealer')
  })

  it('duas cartas do jogador levam ao passo do dealer', () => {
    const state = play(initialRound(false), card('10'), card('6'))
    expect(state.step).toBe('dealer')
    expect(state.hands[0].cards).toEqual(['10', '6'])
  })

  it('o upcard fecha a abertura e a rodada vira jogável', () => {
    const state = play(initialRound(false), card('10'), card('6'), card('9'))
    expect(state.upcard).toBe('9')
    expect(state.step).toBe('playing')
  })

  it('com dealerFirst a ordem inverte e o fim é o mesmo', () => {
    const state = play(initialRound(true), card('9'), card('10'), card('6'))
    expect(state.upcard).toBe('9')
    expect(state.hands[0].cards).toEqual(['10', '6'])
    expect(state.step).toBe('playing')
  })

  /**
   * Blackjack natural não tem jogada: a rodada abre e fecha na mesma
   * transição. Sem isto o overlay ofereceria "pedir" numa mão de 21.
   */
  it('blackjack natural encerra a rodada na abertura', () => {
    const state = play(initialRound(false), card('A'), card('10'), card('9'))
    expect(state.hands[0].status).toBe('blackjack')
    expect(state.step).toBe('done')
  })

  /**
   * Com dealerFirst o blackjack natural também deve ser detectado no fluxo do
   * dealer. Esta é a única guarda para o ramo hand-fixed na transição dealer.
   */
  it('blackjack natural encerra a rodada na abertura com dealerFirst', () => {
    const state = play(initialRound(true), card('9'), card('A'), card('10'))
    expect(state.hands[0].status).toBe('blackjack')
    expect(state.step).toBe('done')
  })

  /**
   * Rank e Upcard têm que descrever o mesmo conjunto de cartas: o reducer
   * converte um no outro ao gravar o upcard. Se um dia divergirem, isto quebra
   * aqui e não numa consulta silenciosa que devolve null.
   */
  it('Rank e Upcard descrevem o mesmo conjunto', () => {
    expect([...RANKS].sort()).toEqual([...UPCARDS].sort())
  })
})

describe('jogando a mão', () => {
  it('pedir acrescenta carta e a mão continua', () => {
    const state = play(opened('10', '6', '9'), card('2'))
    expect(state.hands[0].cards).toEqual(['10', '6', '2'])
    expect(state.hands[0].status).toBe('active')
    expect(state.step).toBe('playing')
  })

  it('estourar encerra a mão e a rodada', () => {
    const state = play(opened('10', '6', '9'), card('10'))
    expect(state.hands[0].status).toBe('busted')
    expect(state.step).toBe('done')
  })

  it('ficar encerra a mão e a rodada', () => {
    const state = play(opened('10', '6', '9'), { type: 'stand' })
    expect(state.hands[0].status).toBe('stood')
    expect(state.step).toBe('done')
  })

  /**
   * 21 não tem jogada: pedir estoura e dobrar não existe. Encerrar sozinho tira
   * um clique de cada mão que chega lá, e nunca pode estar errado.
   */
  it('chegar a 21 encerra a mão sozinho', () => {
    const state = play(opened('10', '6', '9'), card('5'))
    expect(state.hands[0].status).toBe('stood')
    expect(state.step).toBe('done')
  })

  it('mão encerrada não aceita mais cartas', () => {
    const done = play(opened('10', '6', '9'), { type: 'stand' })
    expect(play(done, card('2'))).toEqual(done)
  })
})

describe('dobrar', () => {
  /**
   * Dobrar não encerra na hora: a mão recebe exatamente uma carta e só então
   * fecha. Encerrar no clique deixaria a carta da dobra fora da mão mostrada.
   */
  it('a carta seguinte encerra a mão como dobrada', () => {
    const doubled = play(opened('5', '6', '9'), { type: 'double' })
    expect(doubled.hands[0].status).toBe('active')
    expect(doubled.hands[0].doubling).toBe(true)

    const state = play(doubled, card('9'))
    expect(state.hands[0].status).toBe('doubled')
    expect(state.hands[0].cards).toEqual(['5', '6', '9'])
    expect(state.step).toBe('done')
  })

  it('dobrar e estourar continua sendo estouro', () => {
    const state = play(opened('9', '6', '9'), { type: 'double' }, card('10'))
    expect(state.hands[0].status).toBe('busted')
  })

  /** Dobrar só nas duas primeiras cartas: depois de pedir, o clique não faz nada. */
  it('não dobra depois de já ter pedido', () => {
    const hit = play(opened('5', '4', '9'), card('2'))
    expect(play(hit, { type: 'double' })).toEqual(hit)
  })
})

describe('separar', () => {
  it('vira duas mãos com uma carta cada, jogando a primeira', () => {
    const state = play(opened('8', '8', '9'), { type: 'split' })
    expect(state.hands).toHaveLength(2)
    expect(state.hands[0]).toMatchObject({ cards: ['8'], status: 'active', fromSplit: true })
    expect(state.hands[1]).toMatchObject({ cards: ['8'], status: 'pending', fromSplit: true })
    expect(state.activeIndex).toBe(0)
  })

  it('as mãos têm ids distintos', () => {
    const state = play(opened('8', '8', '9'), { type: 'split' })
    expect(state.hands[0].id).not.toBe(state.hands[1].id)
  })

  it('encerrada a primeira mão, a segunda vira a ativa', () => {
    const state = play(opened('8', '8', '9'), { type: 'split' }, card('10'), { type: 'stand' })
    expect(state.hands[0].status).toBe('stood')
    expect(state.activeIndex).toBe(1)
    expect(state.step).toBe('playing')
  })

  it('a rodada só acaba quando todas as mãos acabam', () => {
    const state = play(
      opened('8', '8', '9'),
      { type: 'split' },
      card('10'),
      { type: 'stand' },
      card('10'),
      { type: 'stand' }
    )
    expect(state.step).toBe('done')
    expect(state.hands.every((hand) => hand.status === 'stood')).toBe(true)
  })

  /** Dobra após separar é permitida — as tabelas de básica deste projeto assumem isso. */
  it('dobra depois de separar', () => {
    const state = play(opened('8', '8', '9'), { type: 'split' }, card('3'), { type: 'double' })
    expect(state.hands[0].doubling).toBe(true)
  })

  it('re-separa um par que aparece depois da separação', () => {
    const state = play(opened('8', '8', '9'), { type: 'split' }, card('8'), { type: 'split' })
    expect(state.hands).toHaveLength(3)
  })

  it('para de separar no limite de mãos', () => {
    let state = play(opened('8', '8', '9'), { type: 'split' })
    while (state.hands.length < MAX_HANDS) {
      state = play(state, card('8'), { type: 'split' })
    }
    expect(state.hands).toHaveLength(MAX_HANDS)
    const blocked = play(state, card('8'), { type: 'split' })
    expect(blocked.hands).toHaveLength(MAX_HANDS)
  })

  /**
   * Ases separados recebem uma carta e encerram. É regra padrão de cassino, e
   * ignorá-la faria o overlay oferecer "pedir" numa mão que a mesa já fechou —
   * conselho errado com cara de certo.
   */
  it('ases separados recebem uma carta e encerram', () => {
    const state = play(opened('A', 'A', '9'), { type: 'split' }, card('6'))
    expect(state.hands[0]).toMatchObject({ cards: ['A', '6'], status: 'stood' })
    expect(state.activeIndex).toBe(1)
  })

  /** 21 vindo de ases separados não é blackjack natural. */
  it('ás separado com 10 fecha como mão comum, não blackjack', () => {
    const state = play(opened('A', 'A', '9'), { type: 'split' }, card('10'))
    expect(state.hands[0].status).toBe('stood')
  })

  it('não separa o que não é par', () => {
    const state = opened('10', '6', '9')
    expect(play(state, { type: 'split' })).toEqual(state)
  })
})
