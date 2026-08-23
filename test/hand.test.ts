import { describe, expect, it } from 'vitest'

import { RANKS, handValue, handRowKey } from '../src/shared/domain/hand'
import { HAND_ROWS } from '../src/shared/domain/basicStrategy'

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

describe('handRowKey', () => {
  const lookup = (cards: Parameters<typeof handValue>[0], canSplit = true) =>
    handRowKey(handValue(cards), canSplit)

  it('mão dura vira a linha hard', () => {
    expect(lookup(['10', '6'])).toEqual({ kind: 'row', key: 'hard-16' })
  })

  it('mão mole vira a linha soft', () => {
    expect(lookup(['A', '7'])).toEqual({ kind: 'row', key: 'soft-18' })
  })

  it('par vira a linha pair quando dá para separar', () => {
    expect(lookup(['8', '8'])).toEqual({ kind: 'row', key: 'pair-8' })
    expect(lookup(['A', 'A'])).toEqual({ kind: 'row', key: 'pair-A' })
  })

  /**
   * No limite de mãos o par deixa de ser separável e passa a ser lida como a
   * mão dura/mole equivalente. Ler pela linha `pair-*` mandaria separar uma mão
   * que a mesa não deixa separar.
   */
  it('par que não pode separar lê pela linha equivalente', () => {
    expect(lookup(['8', '8'], false)).toEqual({ kind: 'row', key: 'hard-16' })
    expect(lookup(['10', '10'], false)).toEqual({ kind: 'always', action: 'stand' })
    expect(lookup(['A', 'A'], false)).toEqual({ kind: 'always', action: 'hit' })
  })

  it('abaixo da menor linha dura a resposta é sempre pedir', () => {
    expect(lookup(['3', '4'])).toEqual({ kind: 'always', action: 'hit' })
  })

  it('acima da maior linha dura a resposta é sempre ficar', () => {
    expect(lookup(['10', '8'])).toEqual({ kind: 'always', action: 'stand' })
  })

  it('mole de 20 é sempre ficar', () => {
    expect(lookup(['A', '9'])).toEqual({ kind: 'always', action: 'stand' })
  })

  /**
   * Rede de proteção: toda chave devolvida tem que existir em HAND_ROWS. Sem
   * isto, um ajuste na tabela deixaria handRowKey apontando para o vazio e
   * cellDecision devolveria null em silêncio.
   */
  it('toda chave devolvida existe em HAND_ROWS', () => {
    const ids = new Set(HAND_ROWS.map((row) => row.id))
    for (const total of [8, 9, 10, 11, 12, 13, 14, 15, 16, 17]) {
      const result = handRowKey(
        { total, soft: false, isPair: false, pairRank: null, busted: false, blackjack: false },
        false
      )
      expect(result.kind === 'row' && ids.has(result.key)).toBe(true)
    }
    for (const total of [13, 14, 15, 16, 17, 18, 19]) {
      const result = handRowKey(
        { total, soft: true, isPair: false, pairRank: null, busted: false, blackjack: false },
        false
      )
      expect(result.kind === 'row' && ids.has(result.key)).toBe(true)
    }
  })
})
