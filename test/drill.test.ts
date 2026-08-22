import { describe, expect, it } from 'vitest'

import { buildDrillDeck, summarizeDrill, summarizeMentalDrill } from '../src/shared/domain/drill'
import type { DrillAnswer } from '../src/shared/domain/drill'
import { createRng, shuffle } from '../src/shared/domain/rng'

describe('createRng / shuffle', () => {
  it('mesma semente, mesma sequência', () => {
    const a = createRng(42)
    const b = createRng(42)
    for (let i = 0; i < 20; i++) expect(a()).toBe(b())
  })

  it('sementes diferentes divergem', () => {
    expect(createRng(1)()).not.toBe(createRng(2)())
  })

  it('embaralha sem perder nem duplicar elemento, e sem tocar na entrada', () => {
    const source = Array.from({ length: 40 }, (_, i) => i)
    const result = shuffle(source, createRng(7))

    expect(result).not.toEqual(source)
    expect([...result].sort((x, y) => x - y)).toEqual(source)
    expect(source).toEqual(Array.from({ length: 40 }, (_, i) => i))
  })
})

describe('buildDrillDeck', () => {
  it('tem 52 cartas por baralho, 4 de cada rank', () => {
    const deck = buildDrillDeck('hilo', 2, 1)
    expect(deck).toHaveLength(104)

    const counts = new Map<string, number>()
    for (const card of deck) counts.set(card.rank, (counts.get(card.rank) ?? 0) + 1)
    expect(counts.size).toBe(13)
    for (const count of counts.values()) expect(count).toBe(8)
  })

  it('a soma de um baralho fecha em 0 no Hi-Lo e em +4 no KO', () => {
    const sum = (system: 'hilo' | 'ko'): number =>
      buildDrillDeck(system, 1, 3).reduce((total, card) => total + card.delta, 0)

    expect(sum('hilo')).toBe(0)
    expect(sum('ko')).toBe(4)
  })

  it('a mesma semente dá a mesma sequência', () => {
    const a = buildDrillDeck('hilo', 1, 99).map((card) => card.rank)
    const b = buildDrillDeck('hilo', 1, 99).map((card) => card.rank)
    expect(a).toEqual(b)
  })

  it('índices são sequenciais e servem de key', () => {
    const deck = buildDrillDeck('hilo', 1, 5)
    expect(deck.map((card) => card.index)).toEqual(deck.map((_, i) => i))
  })
})

describe('summarizeDrill', () => {
  const deck = buildDrillDeck('hilo', 1, 11)

  function answer(index: number, correct: boolean, ms = 300): DrillAnswer {
    const card = deck[index]
    if (card === undefined) throw new Error('carta fora do baralho')
    const wrong = card.bucket === 'low' ? 'high' : 'low'
    return { index, chosen: correct ? card.bucket : wrong, expected: card.bucket, ms }
  }

  it('conta acerto, erro e não respondida', () => {
    const answers: DrillAnswer[] = [
      answer(0, true),
      answer(1, false),
      { index: 2, chosen: null, expected: deck[2]?.bucket ?? 'low', ms: null }
    ]
    const summary = summarizeDrill(deck, answers, 6000)

    expect(summary.cards).toBe(3)
    expect(summary.correct).toBe(1)
    expect(summary.wrong).toBe(1)
    expect(summary.missed).toBe(1)
    // Não respondida entra no denominador: deixar passar é erro, não neutro.
    expect(summary.accuracy).toBeCloseTo(1 / 3, 10)
  })

  it('a média de tempo ignora as cartas sem resposta', () => {
    const answers: DrillAnswer[] = [
      answer(0, true, 200),
      answer(1, true, 400),
      { index: 2, chosen: null, expected: deck[2]?.bucket ?? 'low', ms: null }
    ]
    expect(summarizeDrill(deck, answers, 1000).averageMs).toBe(300)
  })

  it('compara o count do usuário com o das cartas apresentadas', () => {
    const answers = [answer(0, true), answer(1, false), answer(2, true)]
    const summary = summarizeDrill(deck, answers, 3000)

    const expected = answers.reduce((total, item) => {
      const card = deck[item.index]
      return total + (card?.delta ?? 0)
    }, 0)
    expect(summary.expectedRunningCount).toBe(expected)
    // Uma resposta errada é justamente o que faz os dois divergirem.
    expect(summary.answeredRunningCount).not.toBe(summary.expectedRunningCount)
  })

  it('ritmo em cartas por minuto vem do tempo decorrido', () => {
    const answers = [answer(0, true), answer(1, true)]
    expect(summarizeDrill(deck, answers, 60000).cardsPerMinute).toBe(2)
    expect(summarizeDrill(deck, answers, 30000).cardsPerMinute).toBe(4)
  })

  it('não divide por zero sem cartas', () => {
    const summary = summarizeDrill(deck, [], 0)
    expect(summary.accuracy).toBe(0)
    expect(summary.cardsPerMinute).toBe(0)
    expect(summary.averageMs).toBe(0)
  })
})

describe('summarizeMentalDrill', () => {
  const deck = buildDrillDeck('hilo', 1, 21)

  function expected(shown: number): number {
    return deck.slice(0, shown).reduce((total, card) => total + card.delta, 0)
  }

  it('confere a resposta contra as cartas efetivamente mostradas', () => {
    const correct = expected(20)
    const summary = summarizeMentalDrill(deck, 20, correct, 30000)

    expect(summary.cards).toBe(20)
    expect(summary.expectedRunningCount).toBe(correct)
    expect(summary.answeredRunningCount).toBe(correct)
    expect(summary.correct).toBe(true)
    expect(summary.error).toBe(0)
  })

  it('o erro tem sinal: positivo é ter contado alto demais', () => {
    const correct = expected(20)
    expect(summarizeMentalDrill(deck, 20, correct + 3, 1000).error).toBe(3)
    expect(summarizeMentalDrill(deck, 20, correct - 2, 1000).error).toBe(-2)
    expect(summarizeMentalDrill(deck, 20, correct + 1, 1000).correct).toBe(false)
  })

  it('parar no meio só cobra as cartas que passaram', () => {
    const summary = summarizeMentalDrill(deck, 10, expected(10), 20000)
    expect(summary.cards).toBe(10)
    expect(summary.expectedRunningCount).toBe(expected(10))
    expect(summary.correct).toBe(true)
  })

  it('um baralho inteiro de Hi-Lo fecha em zero', () => {
    expect(summarizeMentalDrill(deck, deck.length, 0, 60000).expectedRunningCount).toBe(0)
  })

  it('não conta mais cartas do que o baralho tem', () => {
    const summary = summarizeMentalDrill(deck, 999, 0, 1000)
    expect(summary.cards).toBe(deck.length)
  })

  it('resposta não numérica vira zero em vez de NaN', () => {
    const summary = summarizeMentalDrill(deck, 10, Number.NaN, 1000)
    expect(summary.answeredRunningCount).toBe(0)
    expect(Number.isFinite(summary.error)).toBe(true)
  })

  it('ritmo vem do tempo decorrido', () => {
    expect(summarizeMentalDrill(deck, 30, 0, 60000).cardsPerMinute).toBe(30)
    expect(summarizeMentalDrill(deck, 30, 0, 0).cardsPerMinute).toBe(0)
  })
})
