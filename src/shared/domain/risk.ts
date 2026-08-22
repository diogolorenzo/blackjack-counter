import type { BetSpreadRule, CountingSystem, TrueCountRounding } from '../types'
import { CARDS_PER_DECK } from '../types'
import { lookupUnits } from './betSpread'
import { createRng } from './rng'
import { BASE_HOUSE_EDGE_PCT, EDGE_PER_TRUE_COUNT_PCT } from './system'

/**
 * Variância do blackjack por unidade apostada.
 *
 * ~1.32 é o valor usual para 6 baralhos com dobra, split e rendição: a mão
 * média paga ±1, mas dobras, splits e blackjacks alargam a cauda. Entra ao
 * quadrado da aposta, então é ele que domina o risco de ruína.
 */
export const VARIANCE_PER_UNIT = 1.32

/** Cartas consumidas por rodada, cabeça a cabeça com o dealer. Cada jogador extra soma ~2.7. */
export const DEFAULT_CARDS_PER_ROUND = 5.2

/** Shoes simulados. 5000 estabiliza a distribuição de true count em ~2 casas. */
const DEFAULT_SHOES = 5000

/** Faixa do histograma; as pontas acumulam as caudas. */
const HISTOGRAM_MIN = -6
const HISTOGRAM_MAX = 8

export interface RiskInput {
  system: CountingSystem
  deckCount: number
  /** 0..1 */
  penetration: number
  rounding: TrueCountRounding
  minDecksRemaining: number
  spread: readonly BetSpreadRule[]
  unitValue: number
  /** Banca total na moeda. 0 = não informada. */
  bankroll: number
  handsPerHour: number
  /** 0..1 */
  targetRiskOfRuin: number
  cardsPerRound?: number
  shoes?: number
}

export interface CountFrequency {
  /** True count arredondado da faixa. */
  count: number
  /** Fração das rodadas nesta faixa (0..1). */
  frequency: number
  units: number
  edgePct: number
}

export interface RiskResult {
  distribution: CountFrequency[]
  handsSimulated: number
  averageBetUnits: number
  /** Fração das rodadas com vantagem do jogador. */
  advantageShare: number
  evPerHandUnits: number
  evPerHandMoney: number
  evPerHourMoney: number
  sdPerHandUnits: number
  sdPerHourMoney: number
  /** Mãos até o EV acumulado igualar um desvio padrão. Infinity quando o EV é <= 0. */
  n0Hands: number
  /** 0..1. null quando não há banca informada ou o EV é <= 0. */
  riskOfRuin: number | null
  /** Banca, em unidades, necessária para o risco de ruína alvo. null quando o EV é <= 0. */
  requiredBankrollUnits: number | null
  /** Valor de unidade que atinge o risco alvo com a banca informada. */
  suggestedUnitValue: number | null
}

function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min
  return Math.min(max, Math.max(min, Math.round(value)))
}

/**
 * Distribuição de true count e métricas de banca por simulação de shoes.
 *
 * Por que simular em vez de usar fórmula fechada: a frequência de cada true
 * count depende do número de baralhos E da penetração, e é ela que decide
 * quanto tempo se passa apostando alto. Uma tabela genérica erraria justamente
 * o parâmetro que o usuário mexe.
 *
 * O que a simulação NÃO faz: jogar as mãos. O resultado de cada rodada entra
 * pelo modelo de vantagem (`edge ≈ 0.5 × (TC − 1)`) e pela variância por
 * unidade, não por simulação de estratégia básica. Isso é o suficiente para
 * dimensionar banca e é onde a literatura de risco de ruína também para.
 *
 * Devolve null para sistema sem modelo de vantagem (KO): sem edge por contagem
 * não há EV, e sem EV não há risco de ruína.
 */
export function simulateRisk(input: RiskInput): RiskResult | null {
  if (input.system !== 'hilo') return null

  const deckCount = Math.max(1, Math.round(input.deckCount))
  const totalCards = deckCount * CARDS_PER_DECK
  const penetration = Math.min(0.99, Math.max(0.1, input.penetration))
  const cutCard = Math.floor(totalCards * penetration)
  const cardsPerRound = Math.max(2, input.cardsPerRound ?? DEFAULT_CARDS_PER_ROUND)
  const shoes = Math.max(1, Math.round(input.shoes ?? DEFAULT_SHOES))
  const minDecks = input.minDecksRemaining > 0 ? input.minDecksRemaining : 0.25

  const rng = createRng(0x9e3779b9)

  // Composição do shoe em buckets Hi-Lo: 20 baixas (2-6), 12 neutras (7-9),
  // 20 altas (10-A) por baralho.
  const perDeck = { low: 20, neutral: 12, high: 20 }

  const histogram = new Map<number, { hands: number; unitsSum: number; edgeSum: number }>()
  let hands = 0
  let betSum = 0
  let betSquaredSum = 0
  let evSum = 0
  let advantageHands = 0

  for (let shoe = 0; shoe < shoes; shoe++) {
    let low = perDeck.low * deckCount
    let neutral = perDeck.neutral * deckCount
    let high = perDeck.high * deckCount
    let runningCount = 0
    let seen = 0

    while (seen < cutCard) {
      const remaining = totalCards - seen
      const decksRemaining = Math.max(minDecks, remaining / CARDS_PER_DECK)
      const trueCountExact = runningCount / decksRemaining
      const decisionCount =
        input.rounding === 'floor' ? Math.floor(trueCountExact) : Math.round(trueCountExact)
      const units = lookupUnits(decisionCount, input.spread)
      const edgeFraction =
        (EDGE_PER_TRUE_COUNT_PCT * trueCountExact - BASE_HOUSE_EDGE_PCT) / 100

      hands++
      betSum += units
      betSquaredSum += units * units
      evSum += units * edgeFraction
      if (decisionCount >= 2) advantageHands++

      const bucketKey = clampInt(decisionCount, HISTOGRAM_MIN, HISTOGRAM_MAX)
      const slot = histogram.get(bucketKey) ?? { hands: 0, unitsSum: 0, edgeSum: 0 }
      slot.hands++
      slot.unitsSum += units
      slot.edgeSum += edgeFraction * 100
      histogram.set(bucketKey, slot)

      // Cartas fracionárias por rodada viram um sorteio: 5.2 = 5 cartas com 80%
      // de chance e 6 com 20%, o que preserva a média sem forçar inteiro.
      const whole = Math.floor(cardsPerRound)
      const draw = whole + (rng() < cardsPerRound - whole ? 1 : 0)

      for (let card = 0; card < draw && seen < totalCards; card++) {
        const left = low + neutral + high
        if (left <= 0) break
        const pick = rng() * left
        if (pick < low) {
          low--
          runningCount += 1
        } else if (pick < low + neutral) {
          neutral--
        } else {
          high--
          runningCount -= 1
        }
        seen++
      }
    }
  }

  if (hands === 0) return null

  const distribution: CountFrequency[] = [...histogram.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([count, slot]) => ({
      count,
      frequency: slot.hands / hands,
      units: slot.unitsSum / slot.hands,
      edgePct: slot.edgeSum / slot.hands
    }))

  const evPerHandUnits = evSum / hands
  const variancePerHand = (betSquaredSum / hands) * VARIANCE_PER_UNIT
  const sdPerHandUnits = Math.sqrt(variancePerHand)
  const handsPerHour = Math.max(1, input.handsPerHour)
  const unitValue = Math.max(0, input.unitValue)

  // N0 = σ²/μ²: mãos até o EV acumulado (μ·n) empatar com um desvio padrão
  // acumulado (σ·√n). É a régua honesta de "quanto tempo até o resultado
  // significar alguma coisa".
  const n0Hands = evPerHandUnits > 0 ? variancePerHand / (evPerHandUnits * evPerHandUnits) : Infinity

  // Risco de ruína (banca fixa, jogo indefinido): RoR = e^(−2·B·μ/σ²), com B em
  // unidades. Vem da aproximação por difusão; erra para o conservador quando o
  // spread é muito agressivo.
  const bankrollUnits = unitValue > 0 ? input.bankroll / unitValue : 0
  const riskOfRuin =
    evPerHandUnits > 0 && bankrollUnits > 0
      ? Math.exp((-2 * bankrollUnits * evPerHandUnits) / variancePerHand)
      : null

  const target = Math.min(0.9, Math.max(0.001, input.targetRiskOfRuin))
  const requiredBankrollUnits =
    evPerHandUnits > 0 ? (-variancePerHand * Math.log(target)) / (2 * evPerHandUnits) : null

  const suggestedUnitValue =
    requiredBankrollUnits !== null && requiredBankrollUnits > 0 && input.bankroll > 0
      ? input.bankroll / requiredBankrollUnits
      : null

  return {
    distribution,
    handsSimulated: hands,
    averageBetUnits: betSum / hands,
    advantageShare: advantageHands / hands,
    evPerHandUnits,
    evPerHandMoney: evPerHandUnits * unitValue,
    evPerHourMoney: evPerHandUnits * unitValue * handsPerHour,
    sdPerHandUnits,
    sdPerHourMoney: sdPerHandUnits * unitValue * Math.sqrt(handsPerHour),
    n0Hands,
    riskOfRuin,
    requiredBankrollUnits,
    suggestedUnitValue
  }
}
