import type { Deviation, PlayAction } from './deviations'
import { DEVIATIONS, deviationsForCell } from './deviations'

/** Cartas do dealer, na ordem em que aparecem nas colunas de qualquer chart. */
export const UPCARDS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'A'] as const

export type Upcard = (typeof UPCARDS)[number]

export type HandKind = 'hard' | 'soft' | 'pair'

export interface HandRow {
  /** Chave da linha, igual ao `handKey` dos desvios: `hard-16`, `soft-18`, `pair-10`. */
  id: string
  kind: HandKind
  /** Como a mão aparece na coluna da esquerda. */
  label: string
}

/**
 * Letras da tabela crua:
 *   P = pedir, F = ficar, D = dobrar (senão pedir), V = dobrar (senão ficar),
 *   S = separar, R = render (senão pedir)
 *
 * `V` e `R` existem porque a jogada depende do que a mesa permite: dobrar só
 * vale nas duas primeiras cartas, e render pode nem existir. Guardar a
 * alternativa junto evita que a tabela minta quando a regra não está
 * disponível.
 */
type Code = 'P' | 'F' | 'D' | 'V' | 'S' | 'R'

const ACTION_BY_CODE: Record<Code, PlayAction> = {
  P: 'hit',
  F: 'stand',
  D: 'double',
  V: 'double',
  S: 'split',
  R: 'surrender'
}

/** Para o que cair quando dobrar/render não estiver disponível. */
const FALLBACK_BY_CODE: Record<Code, PlayAction> = {
  P: 'hit',
  F: 'stand',
  D: 'hit',
  V: 'stand',
  S: 'split',
  R: 'hit'
}

/**
 * Estratégia básica para 6 baralhos, dealer para no 17 mole (S17), dobra
 * permitida após separar (DAS) e rendição tardia.
 *
 * Cada linha tem 10 letras, na ordem de UPCARDS (2..10, A).
 *
 * Faltam de propósito as pontas: mão dura de 5 a 7 é sempre pedir e de 18 para
 * cima é sempre ficar, sem exceção e sem desvio de contagem. Ocupariam sete
 * linhas da matriz para não dizer nada.
 */
const CHART: Record<string, string> = {
  'hard-8': 'PPPPPPPPPP',
  'hard-9': 'PDDDDPPPPP',
  'hard-10': 'DDDDDDDDPP',
  'hard-11': 'DDDDDDDDDP',
  'hard-12': 'PPFFFPPPPP',
  'hard-13': 'FFFFFPPPPP',
  'hard-14': 'FFFFFPPPPP',
  'hard-15': 'FFFFFPPPRP',
  'hard-16': 'FFFFFPPRRR',
  'hard-17': 'FFFFFFFFFF',

  'soft-13': 'PPPDDPPPPP',
  'soft-14': 'PPPDDPPPPP',
  'soft-15': 'PPDDDPPPPP',
  'soft-16': 'PPDDDPPPPP',
  'soft-17': 'PDDDDPPPPP',
  'soft-18': 'VVVVVFFPPP',
  'soft-19': 'FFFFFFFFFF',

  'pair-2': 'SSSSSSPPPP',
  'pair-3': 'SSSSSSPPPP',
  'pair-4': 'PPPSSPPPPP',
  'pair-5': 'DDDDDDDDPP',
  'pair-6': 'SSSSSPPPPP',
  'pair-7': 'SSSSSSPPPP',
  'pair-8': 'SSSSSSSSSS',
  'pair-9': 'SSSSSFSSFF',
  'pair-10': 'FFFFFFFFFF',
  'pair-A': 'SSSSSSSSSS'
}

export const HAND_ROWS: readonly HandRow[] = [
  { id: 'hard-8', kind: 'hard', label: '8' },
  { id: 'hard-9', kind: 'hard', label: '9' },
  { id: 'hard-10', kind: 'hard', label: '10' },
  { id: 'hard-11', kind: 'hard', label: '11' },
  { id: 'hard-12', kind: 'hard', label: '12' },
  { id: 'hard-13', kind: 'hard', label: '13' },
  { id: 'hard-14', kind: 'hard', label: '14' },
  { id: 'hard-15', kind: 'hard', label: '15' },
  { id: 'hard-16', kind: 'hard', label: '16' },
  { id: 'hard-17', kind: 'hard', label: '17' },

  { id: 'soft-13', kind: 'soft', label: 'A,2' },
  { id: 'soft-14', kind: 'soft', label: 'A,3' },
  { id: 'soft-15', kind: 'soft', label: 'A,4' },
  { id: 'soft-16', kind: 'soft', label: 'A,5' },
  { id: 'soft-17', kind: 'soft', label: 'A,6' },
  { id: 'soft-18', kind: 'soft', label: 'A,7' },
  { id: 'soft-19', kind: 'soft', label: 'A,8' },

  { id: 'pair-2', kind: 'pair', label: '2,2' },
  { id: 'pair-3', kind: 'pair', label: '3,3' },
  { id: 'pair-4', kind: 'pair', label: '4,4' },
  { id: 'pair-5', kind: 'pair', label: '5,5' },
  { id: 'pair-6', kind: 'pair', label: '6,6' },
  { id: 'pair-7', kind: 'pair', label: '7,7' },
  { id: 'pair-8', kind: 'pair', label: '8,8' },
  { id: 'pair-9', kind: 'pair', label: '9,9' },
  { id: 'pair-10', kind: 'pair', label: '10,10' },
  { id: 'pair-A', kind: 'pair', label: 'A,A' }
]

export const KIND_LABELS: Record<HandKind, string> = {
  hard: 'Mão dura',
  soft: 'Mão mole (com ás)',
  pair: 'Par'
}

export interface StrategyRules {
  /** A mesa aceita rendição tardia? Sem ela, R vira pedir. */
  surrender: boolean
}

export const DEFAULT_STRATEGY_RULES: StrategyRules = { surrender: true }

function codeAt(handKey: string, upcard: Upcard): Code | null {
  const row = CHART[handKey]
  if (row === undefined) return null
  const index = UPCARDS.indexOf(upcard)
  const code = row[index]
  return code === undefined ? null : (code as Code)
}

/** Só a estratégia básica, sem contagem. */
export function basicAction(
  handKey: string,
  upcard: Upcard,
  rules: StrategyRules = DEFAULT_STRATEGY_RULES
): PlayAction | null {
  const code = codeAt(handKey, upcard)
  if (code === null) return null
  if (code === 'R' && !rules.surrender) return FALLBACK_BY_CODE.R
  return ACTION_BY_CODE[code]
}

export interface CellDecision {
  action: PlayAction
  /** A jogada mudou por causa da contagem, em relação à básica desta mesa? */
  deviated: boolean
  /** Índice que governa a célula agora, ou o próximo que vai mudá-la. null quando a contagem não mexe nesta mão. */
  index: number | null
  /** Quanto falta no true count para a próxima mudança. null quando não há mais nenhuma. */
  distance: number | null
}

/**
 * Jogada correta para uma célula no true count atual.
 *
 * Duas coisas fazem isto não ser uma consulta simples:
 *
 * 1. Uma célula pode ter mais de um índice. Em 15 vs 10 o Fab 4 manda render a
 *    partir de 0 e o Illustrious 18 manda parar a partir de +4. Entre os
 *    índices ativos vence o de MAIOR valor, que é a transição mais recente.
 *
 * 2. A tabela básica e os índices podem se contradizer na rendição. Quando a
 *    jogada da tabela é justamente a que um índice liga (15 vs 10 = render, com
 *    índice 0), ela só vale a partir daquele índice: abaixo dele vale a jogada
 *    de baixo do próprio índice. Sem esta regra a matriz mandaria render num
 *    count negativo, onde pedir é melhor.
 *
 * Os índices de rendição são ignorados quando a mesa não tem rendição.
 */
export function cellDecision(
  handKey: string,
  upcard: Upcard,
  count: number,
  rules: StrategyRules = DEFAULT_STRATEGY_RULES
): CellDecision | null {
  const basic = basicAction(handKey, upcard, rules)
  if (basic === null) return null

  const candidates = deviationsForCell(handKey, upcard, DEVIATIONS).filter(
    (item) => rules.surrender || item.deviation !== 'surrender'
  )

  let action = basic
  let governing: Deviation | null = null

  const active = candidates
    .filter((item) => count >= item.index)
    .sort((a, b) => b.index - a.index)

  const top = active[0]
  if (top !== undefined) {
    action = top.deviation
    governing = top
  } else {
    const gating = candidates.find((item) => item.deviation === basic)
    if (gating !== undefined) {
      action = gating.basic
      governing = gating
    }
  }

  const upcoming = candidates
    .filter((item) => item.index > count)
    .sort((a, b) => a.index - b.index)[0]

  return {
    action,
    deviated: action !== basic,
    index: upcoming?.index ?? governing?.index ?? null,
    distance: upcoming === undefined ? null : upcoming.index - count
  }
}

/** Ação efetiva quando dobrar ou separar não é possível (já pediu carta, por exemplo). */
export function fallbackAction(action: PlayAction): PlayAction {
  if (action === 'double') return 'hit'
  if (action === 'surrender') return 'hit'
  return action
}

/** Todas as células que a contagem atual mudou — o que a matriz destaca. */
export function activeCells(
  count: number,
  rules: StrategyRules = DEFAULT_STRATEGY_RULES
): { handKey: string; upcard: Upcard; decision: CellDecision }[] {
  const out: { handKey: string; upcard: Upcard; decision: CellDecision }[] = []
  for (const row of HAND_ROWS) {
    for (const upcard of UPCARDS) {
      const decision = cellDecision(row.id, upcard, count, rules)
      if (decision !== null && decision.deviated) out.push({ handKey: row.id, upcard, decision })
    }
  }
  return out
}
