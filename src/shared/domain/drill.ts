import type { Bucket, CountingSystem, Delta } from '../types'
import { createRng, shuffle } from './rng'
import type { Rank } from './system'
import { RANKS, bucketDelta, rankBucket } from './system'

export interface DrillCard {
  /** Posição no baralho embaralhado; serve de key estável na UI. */
  index: number
  rank: Rank
  bucket: Bucket
  delta: Delta
}

export interface DrillAnswer {
  index: number
  /** null = a carta passou sem resposta (modo velocidade). */
  chosen: Bucket | null
  expected: Bucket
  /** ms desde a carta aparecer. null quando não houve resposta. */
  ms: number | null
}

export interface DrillSummary {
  cards: number
  answered: number
  correct: number
  wrong: number
  missed: number
  /** 0..1 sobre as cartas apresentadas (não respondida conta como erro). */
  accuracy: number
  /** Média das respostas dadas, em ms. 0 quando não houve nenhuma. */
  averageMs: number
  cardsPerMinute: number
  /** Running count correto das cartas apresentadas. */
  expectedRunningCount: number
  /** Running count que o usuário produziu com as teclas que apertou. */
  answeredRunningCount: number
}

/**
 * Baralho de treino embaralhado.
 *
 * É o único lugar do app com rank de verdade: no jogo, quem sabe a carta é o
 * usuário e o app só recebe o bucket. No treino a relação se inverte — o app dá
 * a carta e confere o bucket que o usuário escolheu, que é o que permite medir
 * acerto em vez de só velocidade.
 */
export function buildDrillDeck(
  system: CountingSystem,
  deckCount: number,
  seed: number
): DrillCard[] {
  const decks = Math.max(1, Math.round(deckCount))
  const pool: Rank[] = []
  for (let deck = 0; deck < decks; deck++) {
    for (const rank of RANKS) {
      // 4 naipes por rank. O naipe não muda nada na contagem, então não existe.
      for (let suit = 0; suit < 4; suit++) pool.push(rank)
    }
  }

  return shuffle(pool, createRng(seed)).map((rank, index) => {
    const bucket = rankBucket(system, rank)
    return { index, rank, bucket, delta: bucketDelta(bucket) }
  })
}

export interface MentalSummary {
  /** Cartas efetivamente mostradas (pode ser menos que o baralho, se encerrou antes). */
  cards: number
  elapsedMs: number
  cardsPerMinute: number
  expectedRunningCount: number
  answeredRunningCount: number
  correct: boolean
  /** Resposta menos o correto. Positivo = contou alto demais. */
  error: number
}

/**
 * Treino de contagem mental: o app só passa as cartas e no fim pergunta o
 * running count.
 *
 * É o cenário real. No modo por tecla o jogador classifica uma carta de cada
 * vez e recebe correção implícita a cada acerto; na mesa ele carrega um único
 * número na cabeça por cinco minutos, e um erro no meio some sem aviso. Só este
 * modo mede isso.
 */
export function summarizeMentalDrill(
  cards: readonly DrillCard[],
  shown: number,
  answer: number,
  elapsedMs: number
): MentalSummary {
  const visible = Math.max(0, Math.min(shown, cards.length))
  let expected = 0
  for (let i = 0; i < visible; i++) {
    const card = cards[i]
    if (card !== undefined) expected += card.delta
  }

  const answered = Number.isFinite(answer) ? answer : 0
  return {
    cards: visible,
    elapsedMs,
    cardsPerMinute: elapsedMs <= 0 ? 0 : (visible / elapsedMs) * 60000,
    expectedRunningCount: expected,
    answeredRunningCount: answered,
    correct: answered === expected,
    error: answered - expected
  }
}

export function summarizeDrill(
  cards: readonly DrillCard[],
  answers: readonly DrillAnswer[],
  elapsedMs: number
): DrillSummary {
  let correct = 0
  let wrong = 0
  let missed = 0
  let msSum = 0
  let msCount = 0
  let answeredRunningCount = 0

  for (const answer of answers) {
    if (answer.chosen === null) {
      missed++
      continue
    }
    answeredRunningCount += bucketDelta(answer.chosen)
    if (answer.ms !== null) {
      msSum += answer.ms
      msCount++
    }
    if (answer.chosen === answer.expected) correct++
    else wrong++
  }

  const presented = answers.length
  let expectedRunningCount = 0
  for (const answer of answers) {
    const card = cards[answer.index]
    if (card !== undefined) expectedRunningCount += card.delta
  }

  return {
    cards: presented,
    answered: correct + wrong,
    correct,
    wrong,
    missed,
    accuracy: presented === 0 ? 0 : correct / presented,
    averageMs: msCount === 0 ? 0 : msSum / msCount,
    cardsPerMinute: elapsedMs <= 0 ? 0 : (presented / elapsedMs) * 60000,
    expectedRunningCount,
    answeredRunningCount
  }
}
