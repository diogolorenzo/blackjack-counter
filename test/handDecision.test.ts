import { describe, expect, it } from 'vitest'

import { decideHand } from '../src/shared/domain/handDecision'
import type { Rank } from '../src/shared/domain/hand'
import type { PlayerHand } from '../src/shared/domain/round'

const rules = { surrender: false }

const hand = (cards: Rank[], patch: Partial<PlayerHand> = {}): PlayerHand => ({
  id: 'h',
  cards,
  status: 'active',
  fromSplit: false,
  splitAces: false,
  doubling: false,
  ...patch
})

describe('decideHand', () => {
  it('16 vs 10 em count baixo é a básica', () => {
    const result = decideHand(hand(['10', '6']), '10', -2, rules, true, 1)
    expect(result.action).toBe('hit')
    expect(result.deviated).toBe(false)
  })

  /** Illustrious 18: 16 vs 10 para de pedir a partir de TC 0. */
  it('16 vs 10 em count alto vira desvio', () => {
    const result = decideHand(hand(['10', '6']), '10', 3, rules, true, 1)
    expect(result.action).toBe('stand')
    expect(result.deviated).toBe(true)
    expect(result.index).not.toBe(null)
  })

  /**
   * A invariante do projeto na fiação: em KO nenhuma decisão pode vir marcada
   * como desvio, porque os índices publicados são de Hi-Lo e a escala do KO é
   * outra.
   */
  it('em KO nunca marca desvio', () => {
    const result = decideHand(hand(['10', '6']), '10', 3, rules, false, 1)
    expect(result.action).toBe('hit')
    expect(result.deviated).toBe(false)
    expect(result.index).toBe(null)
  })

  it('mão fora da tabela responde direto', () => {
    expect(decideHand(hand(['3', '4']), '10', 0, rules, true, 1).action).toBe('hit')
    expect(decideHand(hand(['10', '8']), '10', 0, rules, true, 1).action).toBe('stand')
  })

  it('dobrar só nas duas primeiras cartas', () => {
    expect(decideHand(hand(['5', '6']), '5', 0, rules, true, 1).canDouble).toBe(true)
    expect(decideHand(hand(['5', '4', '2']), '5', 0, rules, true, 1).canDouble).toBe(false)
  })

  /** 11 vs 5 é dobrar; depois de pedir carta a mesma mão vira pedir. */
  it('dobrar vira pedir quando não dá mais para dobrar', () => {
    expect(decideHand(hand(['5', '6']), '5', 0, rules, true, 1).action).toBe('double')
    expect(decideHand(hand(['5', '4', '2']), '5', 0, rules, true, 1).action).toBe('hit')
  })

  it('separar só com par e abaixo do limite de mãos', () => {
    expect(decideHand(hand(['8', '8']), '10', 0, rules, true, 1).canSplit).toBe(true)
    expect(decideHand(hand(['8', '8']), '10', 0, rules, true, 4).canSplit).toBe(false)
  })

  it('no limite de mãos o par lê pela mão dura', () => {
    const result = decideHand(hand(['8', '8']), '10', 0, rules, true, 4)
    expect(result.action).not.toBe('split')
  })

  it('render só existe quando a mesa tem, com duas cartas e sem separação', () => {
    const withSurrender = { surrender: true }
    expect(decideHand(hand(['10', '6']), '10', -2, withSurrender, true, 1).canSurrender).toBe(true)
    expect(decideHand(hand(['10', '6']), '10', -2, rules, true, 1).canSurrender).toBe(false)
    expect(
      decideHand(hand(['10', '6'], { fromSplit: true }), '10', -2, withSurrender, true, 1)
        .canSurrender
    ).toBe(false)
  })

  it('mão estourada não tem jogada nem ações', () => {
    const result = decideHand(hand(['10', '9', '5']), '10', 0, rules, true, 1)
    expect(result.canDouble).toBe(false)
    expect(result.canSplit).toBe(false)
    expect(result.canSurrender).toBe(false)
  })
})
