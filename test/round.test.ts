import { describe, expect, it } from 'vitest'

import { UPCARDS } from '../src/shared/domain/basicStrategy'
import type { Rank } from '../src/shared/domain/hand'
import { RANKS } from '../src/shared/domain/hand'
import { initialRound, roundReducer } from '../src/shared/domain/round'
import type { RoundAction, RoundState } from '../src/shared/domain/round'

const play = (state: RoundState, ...actions: RoundAction[]): RoundState =>
  actions.reduce(roundReducer, state)

const card = (rank: Rank): RoundAction => ({
  type: 'addCard',
  rank
})

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
   * Rank e Upcard têm que descrever o mesmo conjunto de cartas: o reducer
   * converte um no outro ao gravar o upcard. Se um dia divergirem, isto quebra
   * aqui e não numa consulta silenciosa que devolve null.
   */
  it('Rank e Upcard descrevem o mesmo conjunto', () => {
    expect([...RANKS].sort()).toEqual([...UPCARDS].sort())
  })
})
