import { describe, expect, it } from 'vitest'

import {
  HAND_ROWS,
  UPCARDS,
  activeCells,
  basicAction,
  cellDecision,
  fallbackAction
} from '../src/shared/domain/basicStrategy'
import type { StrategyRules, Upcard } from '../src/shared/domain/basicStrategy'
import { DEVIATIONS } from '../src/shared/domain/deviations'

const WITH_SURRENDER: StrategyRules = { surrender: true }
const NO_SURRENDER: StrategyRules = { surrender: false }

function action(hand: string, upcard: Upcard, count: number, rules = WITH_SURRENDER): string {
  return cellDecision(hand, upcard, count, rules)?.action ?? 'ausente'
}

describe('tabela de estratégia básica', () => {
  it('toda linha da matriz existe e responde às 10 cartas do dealer', () => {
    for (const row of HAND_ROWS) {
      for (const upcard of UPCARDS) {
        expect(basicAction(row.id, upcard), `${row.id} vs ${upcard}`).not.toBeNull()
      }
    }
  })

  it('mão fora da matriz não inventa jogada', () => {
    expect(basicAction('hard-21', '2')).toBeNull()
    expect(cellDecision('hard-4', 'A', 0)).toBeNull()
  })

  it('acerta as jogadas que todo chart tem igual', () => {
    expect(basicAction('hard-11', '6')).toBe('double')
    expect(basicAction('hard-17', '10')).toBe('stand')
    expect(basicAction('pair-8', '10')).toBe('split')
    expect(basicAction('pair-10', '6')).toBe('stand')
    expect(basicAction('pair-A', '10')).toBe('split')
    expect(basicAction('soft-19', '6')).toBe('stand')
  })

  it('S17: 11 contra ás é pedir, e A,7 contra 6 é dobrar', () => {
    expect(basicAction('hard-11', 'A')).toBe('hit')
    expect(basicAction('soft-18', '6')).toBe('double')
  })

  it('sem rendição, as mãos de render viram pedir', () => {
    expect(basicAction('hard-16', '10', WITH_SURRENDER)).toBe('surrender')
    expect(basicAction('hard-16', '10', NO_SURRENDER)).toBe('hit')
    expect(basicAction('hard-15', '10', NO_SURRENDER)).toBe('hit')
  })

  it('dobrar e separar viram a alternativa quando não dá mais', () => {
    expect(fallbackAction('double')).toBe('hit')
    expect(fallbackAction('surrender')).toBe('hit')
    expect(fallbackAction('stand')).toBe('stand')
    expect(fallbackAction('split')).toBe('split')
  })
})

describe('coerência entre a tabela e os índices publicados', () => {
  it('toda célula citada por um desvio existe na matriz', () => {
    for (const deviation of DEVIATIONS) {
      if (deviation.handKey === null) continue
      const upcard = deviation.upcard as Upcard
      expect(UPCARDS).toContain(upcard)
      expect(
        basicAction(deviation.handKey, upcard),
        `${deviation.id} aponta para célula inexistente`
      ).not.toBeNull()
    }
  })

  /**
   * O par (basic, deviation) de cada índice tem que conter a jogada da tabela,
   * com as regras em que aquele índice foi publicado — I18 sem rendição, Fab 4
   * com ela. Se não contivesse, a matriz e a lista dariam conselhos diferentes
   * para a mesma mão.
   */
  it('a jogada da tabela é uma das duas pontas de cada índice', () => {
    for (const deviation of DEVIATIONS) {
      if (deviation.handKey === null) continue
      const rules = deviation.group === 'fab4' ? WITH_SURRENDER : NO_SURRENDER
      const chart = basicAction(deviation.handKey, deviation.upcard as Upcard, rules)
      expect([deviation.basic, deviation.deviation], `${deviation.id} discorda da tabela`).toContain(
        chart
      )
    }
  })
})

describe('cellDecision com a contagem', () => {
  it('16 vs 10: rende abaixo de zero e para a partir de zero', () => {
    expect(action('hard-16', '10', -1)).toBe('surrender')
    expect(action('hard-16', '10', 0)).toBe('stand')
    expect(action('hard-16', '10', 5)).toBe('stand')
  })

  it('sem rendição, 16 vs 10 vira o Illustrious 18 puro', () => {
    expect(action('hard-16', '10', -1, NO_SURRENDER)).toBe('hit')
    expect(action('hard-16', '10', 0, NO_SURRENDER)).toBe('stand')
  })

  /** A célula com DOIS índices: Fab 4 em 0 e Illustrious 18 em +4. */
  it('15 vs 10 passa por pedir, render e parar conforme o count sobe', () => {
    expect(action('hard-15', '10', -1)).toBe('hit')
    expect(action('hard-15', '10', 0)).toBe('surrender')
    expect(action('hard-15', '10', 3)).toBe('surrender')
    expect(action('hard-15', '10', 4)).toBe('stand')
  })

  it('sem rendição, 15 vs 10 pula a etapa do meio', () => {
    expect(action('hard-15', '10', 0, NO_SURRENDER)).toBe('hit')
    expect(action('hard-15', '10', 3, NO_SURRENDER)).toBe('hit')
    expect(action('hard-15', '10', 4, NO_SURRENDER)).toBe('stand')
  })

  it('índice negativo: 12 vs 4 volta a pedir abaixo de zero', () => {
    expect(action('hard-12', '4', 0)).toBe('stand')
    expect(action('hard-12', '4', -1)).toBe('hit')
  })

  it('12 vs 3 sobe para parar a partir de +2', () => {
    expect(action('hard-12', '3', 1)).toBe('hit')
    expect(action('hard-12', '3', 2)).toBe('stand')
  })

  it('10,10 só separa em count muito alto', () => {
    expect(action('pair-10', '5', 4)).toBe('stand')
    expect(action('pair-10', '5', 5)).toBe('split')
    expect(action('pair-10', '6', 4)).toBe('split')
  })

  it('marca como desvio só o que difere da básica desta mesa', () => {
    // No índice exato, 12 vs 4 coincide com a básica: não é desvio.
    expect(cellDecision('hard-12', '4', 0)?.deviated).toBe(false)
    expect(cellDecision('hard-12', '4', -1)?.deviated).toBe(true)
    expect(cellDecision('hard-16', '10', 0)?.deviated).toBe(true)
    // Mão sem índice nenhum nunca vira desvio.
    expect(cellDecision('hard-17', '10', 9)?.deviated).toBe(false)
  })

  it('informa quanto falta para a próxima mudança', () => {
    const cell = cellDecision('hard-12', '3', 0)
    expect(cell?.index).toBe(2)
    expect(cell?.distance).toBe(2)

    // Passado o último índice da célula, não há próxima mudança.
    const past = cellDecision('hard-12', '3', 9)
    expect(past?.distance).toBeNull()
  })

  it('mão sem índice não reporta distância', () => {
    const cell = cellDecision('hard-17', '2', 0)
    expect(cell?.index).toBeNull()
    expect(cell?.distance).toBeNull()
  })
})

describe('activeCells', () => {
  it('cresce com o count e some quando ele volta ao normal', () => {
    const low = activeCells(-3).length
    const neutral = activeCells(0).length
    const high = activeCells(6).length

    expect(neutral).toBeLessThan(high)
    expect(low).toBeGreaterThan(0)
    expect(high).toBeGreaterThan(0)
  })

  it('em TC +5 inclui as separações de 10,10', () => {
    const ids = activeCells(5).map((cell) => `${cell.handKey}/${cell.upcard}`)
    expect(ids).toContain('pair-10/5')
    expect(ids).toContain('pair-10/6')
  })

  it('não repete célula', () => {
    const ids = activeCells(4).map((cell) => `${cell.handKey}/${cell.upcard}`)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
