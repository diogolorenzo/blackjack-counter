import { describe, expect, it } from 'vitest'

import { simulateRisk } from '../src/shared/domain/risk'
import type { RiskInput } from '../src/shared/domain/risk'
import { DEFAULT_BET_SPREADS } from '../src/shared/defaults'

function input(patch: Partial<RiskInput> = {}): RiskInput {
  return {
    system: 'hilo',
    deckCount: 6,
    penetration: 0.75,
    rounding: 'floor',
    minDecksRemaining: 0.25,
    spread: DEFAULT_BET_SPREADS.hilo,
    unitValue: 25,
    bankroll: 10000,
    handsPerHour: 80,
    targetRiskOfRuin: 0.05,
    // Amostra menor: o teste checa propriedades, não a terceira casa decimal.
    shoes: 400,
    ...patch
  }
}

describe('simulateRisk', () => {
  it('é determinística: mesma entrada, mesmo resultado', () => {
    const a = simulateRisk(input())
    const b = simulateRisk(input())
    expect(a).toEqual(b)
  })

  it('não roda em sistema sem modelo de vantagem', () => {
    expect(simulateRisk(input({ system: 'ko', spread: DEFAULT_BET_SPREADS.ko }))).toBeNull()
  })

  it('a distribuição soma 1 e é centrada perto de zero', () => {
    const result = simulateRisk(input())
    if (result === null) throw new Error('esperava resultado')

    const total = result.distribution.reduce((sum, row) => sum + row.frequency, 0)
    expect(total).toBeCloseTo(1, 6)

    const mode = result.distribution.reduce((best, row) =>
      row.frequency > best.frequency ? row : best
    )
    expect(Math.abs(mode.count)).toBeLessThanOrEqual(1)
  })

  it('aposta média fica entre a base e o topo do spread', () => {
    const result = simulateRisk(input())
    if (result === null) throw new Error('esperava resultado')

    expect(result.averageBetUnits).toBeGreaterThan(1)
    expect(result.averageBetUnits).toBeLessThan(12)
  })

  it('spread 1-12 tem EV positivo; apostar liso não tem', () => {
    const ramped = simulateRisk(input())
    const flat = simulateRisk(input({ spread: [{ minTrueCount: -99, units: 1 }] }))
    if (ramped === null || flat === null) throw new Error('esperava resultado')

    expect(ramped.evPerHandUnits).toBeGreaterThan(0)
    // Sem rampa o jogador leva a vantagem da casa em todas as mãos.
    expect(flat.evPerHandUnits).toBeLessThan(0)
    expect(flat.riskOfRuin).toBeNull()
    expect(flat.n0Hands).toBe(Infinity)
  })

  it('mais penetração aumenta o EV — é o parâmetro que mais importa na mesa', () => {
    const shallow = simulateRisk(input({ penetration: 0.6 }))
    const deep = simulateRisk(input({ penetration: 0.9 }))
    if (shallow === null || deep === null) throw new Error('esperava resultado')

    expect(deep.evPerHandUnits).toBeGreaterThan(shallow.evPerHandUnits)
    expect(deep.advantageShare).toBeGreaterThan(shallow.advantageShare)
  })

  it('banca maior derruba o risco de ruína', () => {
    const small = simulateRisk(input({ bankroll: 2500 }))
    const large = simulateRisk(input({ bankroll: 25000 }))
    if (small?.riskOfRuin == null || large?.riskOfRuin == null) throw new Error('esperava risco')

    expect(large.riskOfRuin).toBeLessThan(small.riskOfRuin)
    expect(small.riskOfRuin).toBeGreaterThan(0)
    expect(small.riskOfRuin).toBeLessThanOrEqual(1)
  })

  it('a unidade sugerida devolve exatamente o risco alvo', () => {
    const base = simulateRisk(input())
    if (base?.suggestedUnitValue == null) throw new Error('esperava sugestão')

    const tuned = simulateRisk(input({ unitValue: base.suggestedUnitValue }))
    if (tuned?.riskOfRuin == null) throw new Error('esperava risco')

    expect(tuned.riskOfRuin).toBeCloseTo(0.05, 6)
  })

  it('sem banca informada não inventa risco de ruína', () => {
    const result = simulateRisk(input({ bankroll: 0 }))
    if (result === null) throw new Error('esperava resultado')

    expect(result.riskOfRuin).toBeNull()
    expect(result.suggestedUnitValue).toBeNull()
    // A banca necessária continua fazendo sentido: não depende de ter banca.
    expect(result.requiredBankrollUnits).toBeGreaterThan(0)
  })

  it('EV por hora é o EV por mão vezes as mãos por hora', () => {
    const result = simulateRisk(input({ handsPerHour: 100 }))
    if (result === null) throw new Error('esperava resultado')

    expect(result.evPerHourMoney).toBeCloseTo(result.evPerHandMoney * 100, 8)
  })
})
