import type { Bucket, CountingSystem, Delta } from '../types'

/** Os 13 ranks de um baralho. Só o modo de treino precisa deles; a contagem é de buckets. */
export const RANKS = [
  'A',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  '10',
  'J',
  'Q',
  'K'
] as const

export type Rank = (typeof RANKS)[number]

export interface SystemProfile {
  id: CountingSystem
  label: string
  /**
   * Balanceado = a soma dos valores de um baralho completo é 0, o que permite
   * dividir pelo número de baralhos restantes (true count) e verificar o
   * fechamento do shoe. Desbalanceado usa o running count cru.
   */
  balanced: boolean
  /** Rótulo curto do número que decide a aposta. */
  countLabel: string
  /** Cartas de cada bucket, para rótulo de botão e para o treino. */
  ranksByBucket: Record<Bucket, readonly Rank[]>
  /** Índice de insurance no número de decisão do sistema. */
  insuranceIndex: number
  /**
   * Existe modelo publicado de vantagem em função do número de decisão?
   * Só o Hi-Lo tem aqui: a aproximação linear do KO depende de tabela de pivô
   * por número de baralhos, e chutar isso seria inventar dinheiro do usuário.
   */
  hasEdgeModel: boolean
}

const HI_LO_RANKS: Record<Bucket, readonly Rank[]> = {
  low: ['2', '3', '4', '5', '6'],
  neutral: ['7', '8', '9'],
  high: ['10', 'J', 'Q', 'K', 'A']
}

/** No KO o 7 vale +1: é isso, e só isso, que torna o sistema desbalanceado. */
const KO_RANKS: Record<Bucket, readonly Rank[]> = {
  low: ['2', '3', '4', '5', '6', '7'],
  neutral: ['8', '9'],
  high: ['10', 'J', 'Q', 'K', 'A']
}

export const SYSTEMS: Record<CountingSystem, SystemProfile> = {
  hilo: {
    id: 'hilo',
    label: 'Hi-Lo',
    balanced: true,
    countLabel: 'True count',
    ranksByBucket: HI_LO_RANKS,
    insuranceIndex: 3,
    hasEdgeModel: true
  },
  ko: {
    id: 'ko',
    label: 'KO',
    balanced: false,
    countLabel: 'Running count',
    ranksByBucket: KO_RANKS,
    // KO Preferred: pivô em +4, insurance a partir de +3.
    insuranceIndex: 3,
    hasEdgeModel: false
  }
}

export function systemProfile(system: CountingSystem): SystemProfile {
  return SYSTEMS[system] ?? SYSTEMS.hilo
}

/**
 * Running count inicial.
 *
 * Hi-Lo é balanceado e começa em 0. O KO começa no IRC = 4 - 4×baralhos
 * (Vancura & Fuchs), que é o offset que faz o pivô cair sempre em +4
 * independentemente do número de baralhos.
 */
export function initialRunningCount(system: CountingSystem, deckCount: number): number {
  if (system !== 'ko') return 0
  return 4 - 4 * deckCount
}

/** Pivô do KO: o ponto em que o jogador tem vantagem. Sem significado no Hi-Lo. */
export const KO_PIVOT = 4

/** Rótulo das cartas de um bucket no sistema ativo, ex: "2-6" ou "2-7". */
export function bucketRankLabel(system: CountingSystem, bucket: Bucket): string {
  const ranks = systemProfile(system).ranksByBucket[bucket]
  const first = ranks[0]
  const last = ranks[ranks.length - 1]
  if (first === undefined || last === undefined) return ''
  return ranks.length === 1 ? first : `${first}-${last}`
}

export function bucketDelta(bucket: Bucket): Delta {
  if (bucket === 'low') return 1
  if (bucket === 'high') return -1
  return 0
}

/** Bucket de um rank no sistema ativo. Usado só pelo treino, onde o app conhece a carta. */
export function rankBucket(system: CountingSystem, rank: Rank): Bucket {
  const profile = systemProfile(system)
  if (profile.ranksByBucket.low.includes(rank)) return 'low'
  if (profile.ranksByBucket.high.includes(rank)) return 'high'
  return 'neutral'
}

/**
 * Vantagem do jogador em pontos percentuais.
 *
 * Aproximação padrão do Hi-Lo: a casa tem ~0,5% num jogo 6D S17 DAS com
 * estratégia básica, e cada ponto de true count devolve ~0,5% ao jogador —
 * logo `edge ≈ 0,5 × (TC − 1)`. Vale como estimativa de ordem de grandeza; as
 * regras exatas da mesa deslocam a base.
 */
export const EDGE_PER_TRUE_COUNT_PCT = 0.5
export const BASE_HOUSE_EDGE_PCT = 0.5

export function advantagePct(system: CountingSystem, trueCountExact: number | null): number | null {
  if (!systemProfile(system).hasEdgeModel) return null
  if (trueCountExact === null || !Number.isFinite(trueCountExact)) return null
  return EDGE_PER_TRUE_COUNT_PCT * trueCountExact - BASE_HOUSE_EDGE_PCT
}
