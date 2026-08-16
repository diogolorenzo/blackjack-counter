import { describe, expect, it } from 'vitest'

import { CountingSession } from '../src/shared/domain/session'
import { computeDerived } from '../src/shared/domain/shoe'
import { lookupUnits, validateBetSpread } from '../src/shared/domain/betSpread'
import {
  bucketLabel,
  bucketToDelta,
  deltaToBucket,
  formatCurrency,
  formatDecks,
  formatSigned,
  formatTrueCount,
  formatUnits
} from '../src/shared/format'
import { BET_SPREAD_FLOOR, DEFAULT_BET_SPREAD, DEFAULT_SETTINGS } from '../src/shared/defaults'
import type { Delta, Entry, ShoeConfig } from '../src/shared/types'
import { CARDS_PER_DECK } from '../src/shared/types'

let seq = 0

function entry(delta: Delta): Entry {
  seq += 1
  return { id: `e${seq}`, delta, at: 1_700_000_000_000 + seq }
}

function cards(delta: Delta, times: number): Entry[] {
  return Array.from({ length: times }, () => entry(delta))
}

function shoeConfig(patch: Partial<ShoeConfig> = {}): ShoeConfig {
  return { ...DEFAULT_SETTINGS.shoe, ...patch }
}

function play(session: CountingSession, ...deltas: Delta[]): void {
  for (const delta of deltas) {
    seq += 1
    session.apply(delta, { id: `c${seq}`, at: 1_700_000_000_000 + seq })
  }
}

function deltasOf(session: CountingSession): Delta[] {
  return session.entries.map((e) => e.delta)
}

describe('computeDerived / Hi-Lo', () => {
  it('conta 4 low + 2 high como running +2 e deriva o true count de 6 baralhos', () => {
    const entries = [...cards(1, 4), ...cards(-1, 2)]
    const d = computeDerived(entries, shoeConfig({ deckCount: 6 }), DEFAULT_BET_SPREAD)

    expect(d.runningCount).toBe(2)
    expect(d.cardsSeen).toBe(6)
    expect(d.totalCards).toBe(312)
    expect(d.cardsRemaining).toBe(306)
    expect(d.decksRemaining).toBeCloseTo(306 / CARDS_PER_DECK, 10)
    expect(d.trueCountExact).toBeCloseTo(0.3399, 4)
    expect(d.trueCountForBets).toBe(0)
    expect(d.betUnits).toBe(1)
    expect(d.insuranceOn).toBe(false)
    expect(d.shoeExhausted).toBe(false)
  })

  it('zera o running count ao consumir um baralho inteiro em proporção real', () => {
    const deck = [...cards(1, 20), ...cards(0, 12), ...cards(-1, 20)]
    expect(deck).toHaveLength(52)

    const d = computeDerived(deck, shoeConfig({ deckCount: 1 }), DEFAULT_BET_SPREAD)

    expect(d.runningCount).toBe(0)
    expect(d.cardsSeen).toBe(52)
    expect(d.cardsRemaining).toBe(0)
    expect(d.shoeExhausted).toBe(true)
    expect(d.trueCountExact).toBe(0)
    expect(d.trueCountForBets).toBe(0)
    expect(d.betUnits).toBe(1)
  })

  it('arredonda true count negativo para baixo com rounding "floor" (-1.2 -> -2)', () => {
    // 4 baralhos, 78 cartas vistas -> 130 restantes -> exatamente 2.5 decks.
    const entries = [...cards(1, 30), ...cards(0, 15), ...cards(-1, 33)]
    expect(entries).toHaveLength(78)

    const floored = computeDerived(entries, shoeConfig({ deckCount: 4 }), DEFAULT_BET_SPREAD)
    expect(floored.runningCount).toBe(-3)
    expect(floored.decksRemaining).toBe(2.5)
    expect(floored.trueCountExact).toBeCloseTo(-1.2, 10)
    expect(floored.trueCountForBets).toBe(-2)
    expect(floored.betUnits).toBe(1)

    const nearest = computeDerived(
      entries,
      shoeConfig({ deckCount: 4, trueCountRounding: 'nearest' }),
      DEFAULT_BET_SPREAD
    )
    expect(nearest.trueCountForBets).toBe(-1)
  })

  it('mantém o true count finito no fim do shoe graças ao clamp de minDecksRemaining', () => {
    const almostDone = [...cards(1, 20), ...cards(0, 16), ...cards(-1, 15)]
    expect(almostDone).toHaveLength(51)

    const near = computeDerived(almostDone, shoeConfig({ deckCount: 1 }), DEFAULT_BET_SPREAD)
    expect(near.runningCount).toBe(5)
    expect(near.cardsRemaining).toBe(1)
    expect(near.decksRemaining).toBe(0.25)
    expect(near.trueCountExact).toBe(20)
    expect(near.trueCountForBets).toBe(20)
    expect(near.betUnits).toBe(12)
    expect(near.insuranceOn).toBe(true)

    const exhausted = computeDerived(
      [...almostDone, ...cards(0, 1)],
      shoeConfig({ deckCount: 1 }),
      DEFAULT_BET_SPREAD
    )
    expect(exhausted.cardsRemaining).toBe(0)
    expect(exhausted.decksRemaining).toBe(0.25)
    expect(Number.isFinite(exhausted.trueCountExact)).toBe(true)
    expect(exhausted.trueCountExact).toBe(20)
  })

  it('não divide por zero nem com minDecksRemaining inválido', () => {
    const deck = [...cards(1, 20), ...cards(0, 17), ...cards(-1, 15)]
    const d = computeDerived(deck, shoeConfig({ deckCount: 1, minDecksRemaining: 0 }), DEFAULT_BET_SPREAD)

    expect(d.cardsRemaining).toBe(0)
    expect(Number.isFinite(d.trueCountExact)).toBe(true)
    expect(Number.isFinite(d.trueCountForBets)).toBe(true)
    expect(d.decksRemaining).toBeGreaterThan(0)
  })

  it('nunca deixa cardsRemaining negativo quando o shoe estoura', () => {
    const d = computeDerived(cards(0, 60), shoeConfig({ deckCount: 1 }), DEFAULT_BET_SPREAD)

    expect(d.cardsSeen).toBe(60)
    expect(d.cardsRemaining).toBe(0)
    expect(d.shoeExhausted).toBe(true)
  })

  it('marca penetrationReached na carta exata do corte', () => {
    const config = shoeConfig({ deckCount: 6, penetration: 0.75 })

    expect(computeDerived(cards(0, 233), config, DEFAULT_BET_SPREAD).penetrationReached).toBe(false)
    expect(computeDerived(cards(0, 234), config, DEFAULT_BET_SPREAD).penetrationReached).toBe(true)
  })

  it('liga insurance exatamente em true count +3', () => {
    // 6 baralhos, 52 vistas -> 5 decks restantes. running +10 -> TC +2; +15 -> +3.
    const tcTwo = [...cards(1, 31), ...cards(-1, 21)]
    const tcThree = [...cards(1, 33), ...cards(0, 1), ...cards(-1, 18)]

    const below = computeDerived(tcTwo, shoeConfig({ deckCount: 6 }), DEFAULT_BET_SPREAD)
    expect(below.trueCountForBets).toBe(2)
    expect(below.insuranceOn).toBe(false)

    const at = computeDerived(tcThree, shoeConfig({ deckCount: 6 }), DEFAULT_BET_SPREAD)
    expect(at.trueCountForBets).toBe(3)
    expect(at.insuranceOn).toBe(true)
  })
})

describe('CountingSession', () => {
  it('registra cartas com o id e o timestamp injetados', () => {
    const session = new CountingSession()
    session.apply(1, { id: 'fixed-id', at: 42 })

    expect(session.entries).toEqual([{ id: 'fixed-id', delta: 1, at: 42 }])
  })

  it('não deixa o array do construtor virar alias do estado interno', () => {
    const seed = [entry(1)]
    const session = new CountingSession(seed)
    seed.push(entry(-1))

    expect(session.entries).toHaveLength(1)
  })

  it('desfaz e refaz na ordem certa', () => {
    const session = new CountingSession()
    play(session, 1, 0, -1)
    expect(deltasOf(session)).toEqual([1, 0, -1])

    expect(session.undo()).toBe(true)
    expect(session.undo()).toBe(true)
    expect(deltasOf(session)).toEqual([1])
    expect(session.canRedo).toBe(true)

    expect(session.redo()).toBe(true)
    expect(deltasOf(session)).toEqual([1, 0])
    expect(session.canUndo).toBe(true)
    expect(session.canRedo).toBe(true)
  })

  it('invalida o redo quando uma carta nova é aplicada', () => {
    const session = new CountingSession()
    play(session, 1, 0, -1)
    session.undo()
    session.undo()
    expect(session.canRedo).toBe(true)

    play(session, -1)

    expect(session.canRedo).toBe(false)
    expect(session.redo()).toBe(false)
    expect(deltasOf(session)).toEqual([1, -1])
  })

  it('devolve false ao desfazer ou refazer sem histórico', () => {
    const session = new CountingSession()

    expect(session.canUndo).toBe(false)
    expect(session.canRedo).toBe(false)
    expect(session.undo()).toBe(false)
    expect(session.redo()).toBe(false)
    expect(session.entries).toEqual([])
  })

  it('trata newShoe como operação desfazível e sinaliza undoRestoresShoe', () => {
    const session = new CountingSession()
    play(session, 1, -1)
    expect(session.undoRestoresShoe).toBe(false)

    session.newShoe()
    expect(session.entries).toEqual([])
    expect(session.canUndo).toBe(true)
    expect(session.undoRestoresShoe).toBe(true)

    expect(session.undo()).toBe(true)
    expect(deltasOf(session)).toEqual([1, -1])
    expect(session.undoRestoresShoe).toBe(false)

    expect(session.redo()).toBe(true)
    expect(session.entries).toEqual([])
    expect(session.undoRestoresShoe).toBe(true)
  })

  it('volta undoRestoresShoe para false depois de uma carta normal', () => {
    const session = new CountingSession()
    session.newShoe()
    expect(session.undoRestoresShoe).toBe(true)

    play(session, 1)

    expect(session.undoRestoresShoe).toBe(false)
  })

  it('limita a pilha de undo em 250 frames', () => {
    const session = new CountingSession()
    for (let i = 0; i < 300; i += 1) play(session, 1)

    let undone = 0
    while (session.undo()) undone += 1

    expect(undone).toBe(250)
    expect(session.entries).toHaveLength(50)
    expect(session.canUndo).toBe(false)
  })

  it('devolve o histórico recente com os mais novos primeiro', () => {
    const session = new CountingSession()
    play(session, 1, 0, -1, 1)

    expect(session.recent(2).map((e) => e.delta)).toEqual([1, -1])
    expect(session.recent(99)).toHaveLength(4)
    expect(session.recent(0)).toEqual([])
  })
})

describe('lookupUnits', () => {
  it('acerta as bordas exatas de cada faixa do spread padrão', () => {
    const cases: Array<[number, number]> = [
      [BET_SPREAD_FLOOR, 1],
      [-5, 1],
      [-1, 1],
      [0, 1],
      [1, 1],
      [2, 2],
      [3, 4],
      [4, 8],
      [5, 12],
      [6, 12],
      [50, 12]
    ]

    for (const [trueCount, units] of cases) {
      expect(lookupUnits(trueCount, DEFAULT_BET_SPREAD)).toBe(units)
    }
  })

  it('não sobe de faixa antes da borda', () => {
    expect(lookupUnits(1.99, DEFAULT_BET_SPREAD)).toBe(1)
    expect(lookupUnits(2, DEFAULT_BET_SPREAD)).toBe(2)
    expect(lookupUnits(4.99, DEFAULT_BET_SPREAD)).toBe(8)
  })

  it('ignora a ordem do array de regras', () => {
    const shuffled = [...DEFAULT_BET_SPREAD].reverse()

    expect(lookupUnits(4, shuffled)).toBe(8)
    expect(lookupUnits(-3, shuffled)).toBe(1)
  })

  it('cai em 1 unidade quando nenhuma regra casa', () => {
    expect(lookupUnits(0, [])).toBe(1)
    expect(lookupUnits(0, [{ minTrueCount: 3, units: 8 }])).toBe(1)
  })
})

describe('validateBetSpread', () => {
  it('aceita o spread padrão sem alterá-lo', () => {
    const result = validateBetSpread(DEFAULT_BET_SPREAD)

    expect(result.ok).toBe(true)
    expect(result.errors).toEqual([])
    expect(result.normalized).toEqual(DEFAULT_BET_SPREAD)
    expect(DEFAULT_BET_SPREAD[0]).toEqual({ minTrueCount: 5, units: 12 })
  })

  it('ordena decrescente e garante a regra de piso', () => {
    const result = validateBetSpread([
      { minTrueCount: 2, units: 2 },
      { minTrueCount: 5, units: 12 }
    ])

    expect(result.ok).toBe(true)
    expect(result.normalized).toEqual([
      { minTrueCount: 5, units: 12 },
      { minTrueCount: 2, units: 2 },
      { minTrueCount: BET_SPREAD_FLOOR, units: 1 }
    ])
    expect(lookupUnits(-10, result.normalized)).toBe(1)
  })

  it('rejeita units <= 0 ou não finito', () => {
    for (const units of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      const result = validateBetSpread([
        { minTrueCount: 2, units },
        { minTrueCount: BET_SPREAD_FLOOR, units: 1 }
      ])

      expect(result.ok).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.normalized).toEqual([{ minTrueCount: BET_SPREAD_FLOOR, units: 1 }])
    }
  })

  it('rejeita minTrueCount duplicado', () => {
    const result = validateBetSpread([
      { minTrueCount: 2, units: 2 },
      { minTrueCount: 2, units: 4 },
      { minTrueCount: BET_SPREAD_FLOOR, units: 1 }
    ])

    expect(result.ok).toBe(false)
    expect(result.errors.some((e) => e.includes('duplicado'))).toBe(true)
    expect(result.normalized).toEqual([
      { minTrueCount: 2, units: 2 },
      { minTrueCount: BET_SPREAD_FLOOR, units: 1 }
    ])
  })

  it('rejeita minTrueCount não finito', () => {
    const result = validateBetSpread([{ minTrueCount: Number.NaN, units: 2 }])

    expect(result.ok).toBe(false)
    expect(result.normalized).toEqual(DEFAULT_BET_SPREAD)
  })

  it('rejeita spread vazio e devolve uma cópia do padrão', () => {
    const result = validateBetSpread([])

    expect(result.ok).toBe(false)
    expect(result.errors).toHaveLength(1)
    expect(result.normalized).toEqual(DEFAULT_BET_SPREAD)
    expect(result.normalized).not.toBe(DEFAULT_BET_SPREAD)
    expect(result.normalized[0]).not.toBe(DEFAULT_BET_SPREAD[0])
  })
})

describe('format', () => {
  it('formatSigned', () => {
    expect(formatSigned(3)).toBe('+3')
    expect(formatSigned(0)).toBe('0')
    expect(formatSigned(-0)).toBe('0')
    expect(formatSigned(-2)).toBe('-2')
    expect(formatSigned(12)).toBe('+12')
  })

  it('formatTrueCount', () => {
    expect(formatTrueCount(2.43)).toBe('+2.4')
    expect(formatTrueCount(0)).toBe('0.0')
    expect(formatTrueCount(-0.04)).toBe('0.0')
    expect(formatTrueCount(2)).toBe('+2.0')
    expect(formatTrueCount(-1.26)).toBe('-1.3')
    expect(formatTrueCount(-2.44)).toBe('-2.4')
  })

  it('formatDecks', () => {
    expect(formatDecks(4.512)).toBe('4.5')
    expect(formatDecks(6)).toBe('6.0')
    expect(formatDecks(0.25)).toBe('0.3')
  })

  it('formatUnits', () => {
    expect(formatUnits(4)).toBe('4u')
    expect(formatUnits(1)).toBe('1u')
    expect(formatUnits(1.5)).toBe('1.5u')
  })

  it('formatCurrency em pt-BR', () => {
    // O Intl separa o símbolo com espaço não quebrável, e o code point varia com a versão do ICU.
    const normalize = (s: string): string => s.replace(/[  ]/g, ' ')

    expect(normalize(formatCurrency(4, 25))).toBe('R$ 100,00')
    expect(normalize(formatCurrency(0, 25))).toBe('R$ 0,00')
    expect(normalize(formatCurrency(12, 2.5))).toBe('R$ 30,00')
  })

  it('converte delta e bucket nos dois sentidos', () => {
    expect(deltaToBucket(1)).toBe('low')
    expect(deltaToBucket(0)).toBe('neutral')
    expect(deltaToBucket(-1)).toBe('high')

    expect(bucketToDelta('low')).toBe(1)
    expect(bucketToDelta('neutral')).toBe(0)
    expect(bucketToDelta('high')).toBe(-1)

    for (const delta of [1, 0, -1] as Delta[]) {
      expect(bucketToDelta(deltaToBucket(delta))).toBe(delta)
    }
  })

  it('rotula os buckets com as cartas de cada faixa', () => {
    expect(bucketLabel('low')).toBe('2-6')
    expect(bucketLabel('neutral')).toBe('7-9')
    expect(bucketLabel('high')).toBe('10-A')
  })
})
