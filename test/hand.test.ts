import { describe, expect, it } from 'vitest'

import { RANKS, handValue } from '../src/shared/domain/hand'

describe('handValue', () => {
  it('soma cartas numéricas', () => {
    expect(handValue(['10', '6'])).toMatchObject({ total: 16, soft: false, busted: false })
  })

  it('conta o ás como 11 enquanto não estoura', () => {
    expect(handValue(['A', '7'])).toMatchObject({ total: 18, soft: true })
  })

  it('rebaixa o ás para 1 quando 11 estouraria', () => {
    expect(handValue(['A', '7', '9'])).toMatchObject({ total: 17, soft: false, busted: false })
  })

  /** A,A vale 12: um ás como 11, o outro como 1. É par, e é a única mão mole de 12. */
  it('A,A vale 12, é mole e é par', () => {
    expect(handValue(['A', 'A'])).toMatchObject({
      total: 12,
      soft: true,
      isPair: true,
      pairRank: 'A'
    })
  })

  it('rebaixa os dois ases quando precisa', () => {
    expect(handValue(['A', 'A', '10', '9'])).toMatchObject({ total: 21, soft: false })
  })

  it('marca estouro', () => {
    expect(handValue(['10', '9', '5'])).toMatchObject({ total: 24, busted: true })
  })

  it('par só com exatamente duas cartas iguais', () => {
    expect(handValue(['8', '8']).isPair).toBe(true)
    expect(handValue(['8', '8', '8']).isPair).toBe(false)
    expect(handValue(['10', '5']).isPair).toBe(false)
  })

  it('21 em duas cartas é blackjack', () => {
    expect(handValue(['A', '10']).blackjack).toBe(true)
  })

  /**
   * 21 vindo de separação não é blackjack natural: não paga 3:2 e a mão segue
   * sendo uma mão comum. Tratar como natural mudaria o que a UI mostra no fim
   * da rodada.
   */
  it('21 pós-separação não é blackjack', () => {
    expect(handValue(['A', '10'], true).blackjack).toBe(false)
  })

  it('RANKS tem as 10 teclas, sem J/Q/K', () => {
    expect(RANKS).toHaveLength(10)
    expect(RANKS).toContain('10')
    expect(RANKS).not.toContain('K')
  })
})
