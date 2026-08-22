import { describe, expect, it } from 'vitest'

import { computeDerived } from '../src/shared/domain/shoe'
import {
  KO_PIVOT,
  advantagePct,
  bucketDelta,
  bucketRankLabel,
  initialRunningCount,
  rankBucket,
  systemProfile
} from '../src/shared/domain/system'
import { DEFAULT_BET_SPREADS, DEFAULT_SETTINGS } from '../src/shared/defaults'
import type { Delta, Entry, ShoeConfig } from '../src/shared/types'

let seq = 0

function cards(delta: Delta, times: number): Entry[] {
  return Array.from({ length: times }, () => {
    seq += 1
    return { id: `k${seq}`, delta, at: seq }
  })
}

function shoe(patch: Partial<ShoeConfig> = {}): ShoeConfig {
  return { ...DEFAULT_SETTINGS.shoe, ...patch }
}

describe('initialRunningCount', () => {
  it('Hi-Lo começa em zero em qualquer número de baralhos', () => {
    for (const decks of [1, 2, 4, 6, 8]) {
      expect(initialRunningCount('hilo', decks)).toBe(0)
    }
  })

  it('KO usa IRC = 4 - 4×baralhos, que é o que fixa o pivô em +4', () => {
    expect(initialRunningCount('ko', 1)).toBe(0)
    expect(initialRunningCount('ko', 2)).toBe(-4)
    expect(initialRunningCount('ko', 6)).toBe(-20)
    expect(initialRunningCount('ko', 8)).toBe(-28)
  })
})

describe('computeDerived em KO', () => {
  it('parte do IRC e não produz true count', () => {
    const d = computeDerived([], shoe({ system: 'ko', deckCount: 6 }), DEFAULT_BET_SPREADS.ko)

    expect(d.runningCount).toBe(-20)
    expect(d.rawCount).toBe(0)
    expect(d.trueCountExact).toBeNull()
    // Sem divisão por baralhos: o número de decisão É o running count.
    expect(d.decisionCount).toBe(-20)
  })

  it('não divide por baralhos restantes nem no fim do shoe', () => {
    const entries = cards(1, 300)
    const d = computeDerived(entries, shoe({ system: 'ko', deckCount: 6 }), DEFAULT_BET_SPREADS.ko)

    expect(d.rawCount).toBe(300)
    expect(d.runningCount).toBe(280)
    expect(d.decisionCount).toBe(280)
    expect(d.trueCountExact).toBeNull()
  })

  it('liga insurance a partir de +3 no running count', () => {
    // IRC de 1 baralho é 0, então o running count é a soma pura.
    const at2 = computeDerived(cards(1, 2), shoe({ system: 'ko', deckCount: 1 }), DEFAULT_BET_SPREADS.ko)
    const at3 = computeDerived(cards(1, 3), shoe({ system: 'ko', deckCount: 1 }), DEFAULT_BET_SPREADS.ko)

    expect(at2.decisionCount).toBe(2)
    expect(at2.insuranceOn).toBe(false)
    expect(at3.decisionCount).toBe(3)
    expect(at3.insuranceOn).toBe(true)
  })

  it('não estima vantagem: o modelo de edge publicado é do Hi-Lo', () => {
    const d = computeDerived(cards(1, 24), shoe({ system: 'ko', deckCount: 1 }), DEFAULT_BET_SPREADS.ko)
    expect(d.advantagePct).toBeNull()
    expect(d.evPerHandUnits).toBeNull()
  })

  it('o pivô do KO é +4 independentemente dos baralhos', () => {
    expect(KO_PIVOT).toBe(4)
    for (const decks of [1, 2, 6, 8]) {
      const full = 52 * decks
      // Shoe inteiro visto: soma pura de um baralho KO é +4 por baralho
      // (20 baixas + 4 setes − 20 altas), então o count termina no pivô.
      const perDeck = [...cards(1, 24), ...cards(0, 8), ...cards(-1, 20)]
      const entries = Array.from({ length: decks }, () => perDeck).flat()
      expect(entries).toHaveLength(full)

      const d = computeDerived(entries, shoe({ system: 'ko', deckCount: decks }), DEFAULT_BET_SPREADS.ko)
      expect(d.runningCount).toBe(KO_PIVOT)
    }
  })
})

describe('computeDerived em Hi-Lo', () => {
  it('fecha em zero com um shoe completo — é o que permite conferir a contagem', () => {
    const perDeck = [...cards(1, 20), ...cards(0, 12), ...cards(-1, 20)]
    const entries = [...perDeck, ...perDeck]
    const d = computeDerived(entries, shoe({ deckCount: 2 }), DEFAULT_BET_SPREADS.hilo)

    expect(d.cardsSeen).toBe(104)
    expect(d.rawCount).toBe(0)
    expect(d.runningCount).toBe(0)
  })

  it('vantagem é 0,5%×(TC−1): zero em TC +1, meio ponto em TC +2', () => {
    expect(advantagePct('hilo', 1)).toBeCloseTo(0, 10)
    expect(advantagePct('hilo', 2)).toBeCloseTo(0.5, 10)
    expect(advantagePct('hilo', 0)).toBeCloseTo(-0.5, 10)
    expect(advantagePct('ko', 3)).toBeNull()
    expect(advantagePct('hilo', null)).toBeNull()
  })

  it('EV da mão é a vantagem aplicada à aposta em vigor', () => {
    const entries = cards(1, 52)
    const d = computeDerived(entries, shoe({ deckCount: 6 }), DEFAULT_BET_SPREADS.hilo)

    expect(d.advantagePct).not.toBeNull()
    expect(d.evPerHandUnits).toBeCloseTo((d.betUnits * (d.advantagePct ?? 0)) / 100, 10)
  })
})

describe('buckets por sistema', () => {
  it('o 7 é neutro no Hi-Lo e baixo no KO', () => {
    expect(rankBucket('hilo', '7')).toBe('neutral')
    expect(rankBucket('ko', '7')).toBe('low')
  })

  it('o resto das cartas cai no mesmo bucket nos dois sistemas', () => {
    for (const rank of ['2', '3', '4', '5', '6'] as const) {
      expect(rankBucket('hilo', rank)).toBe('low')
      expect(rankBucket('ko', rank)).toBe('low')
    }
    for (const rank of ['10', 'J', 'Q', 'K', 'A'] as const) {
      expect(rankBucket('hilo', rank)).toBe('high')
      expect(rankBucket('ko', rank)).toBe('high')
    }
  })

  it('delta do bucket é o mesmo nos dois sistemas', () => {
    expect(bucketDelta('low')).toBe(1)
    expect(bucketDelta('neutral')).toBe(0)
    expect(bucketDelta('high')).toBe(-1)
  })

  it('rótulos acompanham o sistema', () => {
    expect(bucketRankLabel('hilo', 'neutral')).toBe('7-9')
    expect(bucketRankLabel('ko', 'neutral')).toBe('8-9')
  })

  it('sistema desconhecido cai em Hi-Lo em vez de quebrar', () => {
    expect(systemProfile('nope' as never).id).toBe('hilo')
  })
})
