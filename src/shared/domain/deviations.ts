import type { CountingSystem, DecisionLanguage } from '../types'

export type PlayAction =
  | 'hit'
  | 'stand'
  | 'double'
  | 'split'
  | 'surrender'
  | 'insurance'
  | 'noInsurance'

/**
 * Código de uma letra para a matriz, onde não cabe a palavra inteira.
 *
 * As letras seguem o português (Pedir, Ficar, Dobrar, Separar, Render) e não o
 * inglês: num chart em inglês "S" é stand, e usar a mesma letra para separar
 * seria a troca mais cara possível de fazer no meio de uma mão.
 */
export const PLAY_CODES: Record<PlayAction, string> = {
  hit: 'P',
  stand: 'F',
  double: 'D',
  split: 'S',
  surrender: 'R',
  insurance: 'Sg',
  noInsurance: '—'
}

/**
 * Uma jogada tinha dois nomes na mesma tela: o painel de decisão do overlay
 * lia esta lista (minúscula, "parar") para o texto grande, mas os botões de
 * clique eram strings soltas ("Ficar") — a mesma jogada com dois nomes
 * diferentes no meio de uma mão. Agora os dois lêem daqui, e o mapa serve
 * também a aba Desvios, para o vocabulário não divergir de novo entre as
 * duas telas.
 *
 * `insurance`/`noInsurance` não são "fazer seguro"/"sem seguro" por escolha
 * deliberada: a única exibição deles é sempre ao lado de um rótulo "Seguro"
 * (ou "Insurance"), então a jogada em si é só a resposta — Sim/Não — sem
 * repetir a palavra.
 *
 * Inglês existe como opção do usuário, não como padrão: o resto do app
 * continua em português.
 */
export const PLAY_LABELS: Record<DecisionLanguage, Record<PlayAction, string>> = {
  pt: {
    hit: 'Pedir',
    stand: 'Ficar',
    double: 'Dobrar',
    split: 'Separar',
    surrender: 'Cashout',
    insurance: 'Sim',
    noInsurance: 'Não'
  },
  en: {
    hit: 'Ask',
    stand: 'Stay',
    double: 'Double',
    split: 'Split',
    surrender: 'Cashout',
    insurance: 'Yes',
    noInsurance: 'No'
  }
}

export interface Deviation {
  id: string
  /**
   * Célula da matriz de estratégia que este desvio altera: `hard-16`, `pair-10`,
   * `soft-18`. null no seguro, que não é uma decisão de mão.
   */
  handKey: string | null
  /** Mão do jogador. */
  hand: string
  /** Carta do dealer. */
  upcard: string
  /** Índice no true count: a partir daqui (>=) vale o desvio. */
  index: number
  /** Jogada quando o true count alcança o índice. */
  deviation: PlayAction
  /** Jogada abaixo do índice — que é exatamente a estratégia básica. */
  basic: PlayAction
  group: 'i18' | 'fab4'
}

/**
 * Illustrious 18 + Fab 4, índices de Hi-Lo para 6 baralhos, S17, DAS, com
 * rendição tardia (Schlesinger / Wong). São os desvios que concentram quase
 * todo o ganho de index play; a lista completa tem mais de 100 e o resto é
 * ruído em EV.
 *
 * Convenção da tabela: `basic` é a jogada abaixo do índice e `deviation` é a
 * jogada a partir dele. Isso vale para os índices negativos também — em 12 vs 4
 * a básica é PARAR e o desvio é PEDIR abaixo de 0, o que aqui aparece como
 * basic=hit/deviation=stand com índice 0. Ler sempre como "a partir de X, faça
 * `deviation`".
 *
 * Regras diferentes (H17, sem DAS, sem rendição) deslocam alguns índices em até
 * um ponto. Confira contra a sua mesa.
 */
export const DEVIATIONS: readonly Deviation[] = [
  { id: 'ins', handKey: null, hand: 'Seguro', upcard: 'A', index: 3, deviation: 'insurance', basic: 'noInsurance', group: 'i18' },
  { id: '16v10', handKey: 'hard-16', hand: '16', upcard: '10', index: 0, deviation: 'stand', basic: 'hit', group: 'i18' },
  { id: '15v10', handKey: 'hard-15', hand: '15', upcard: '10', index: 4, deviation: 'stand', basic: 'hit', group: 'i18' },
  { id: 'TTv5', handKey: 'pair-10', hand: '10,10', upcard: '5', index: 5, deviation: 'split', basic: 'stand', group: 'i18' },
  { id: 'TTv6', handKey: 'pair-10', hand: '10,10', upcard: '6', index: 4, deviation: 'split', basic: 'stand', group: 'i18' },
  { id: '10v10', handKey: 'hard-10', hand: '10', upcard: '10', index: 4, deviation: 'double', basic: 'hit', group: 'i18' },
  { id: '12v3', handKey: 'hard-12', hand: '12', upcard: '3', index: 2, deviation: 'stand', basic: 'hit', group: 'i18' },
  { id: '12v2', handKey: 'hard-12', hand: '12', upcard: '2', index: 3, deviation: 'stand', basic: 'hit', group: 'i18' },
  { id: '11vA', handKey: 'hard-11', hand: '11', upcard: 'A', index: 1, deviation: 'double', basic: 'hit', group: 'i18' },
  { id: '9v2', handKey: 'hard-9', hand: '9', upcard: '2', index: 1, deviation: 'double', basic: 'hit', group: 'i18' },
  { id: '10vA', handKey: 'hard-10', hand: '10', upcard: 'A', index: 4, deviation: 'double', basic: 'hit', group: 'i18' },
  { id: '9v7', handKey: 'hard-9', hand: '9', upcard: '7', index: 3, deviation: 'double', basic: 'hit', group: 'i18' },
  { id: '16v9', handKey: 'hard-16', hand: '16', upcard: '9', index: 5, deviation: 'stand', basic: 'hit', group: 'i18' },
  { id: '13v2', handKey: 'hard-13', hand: '13', upcard: '2', index: -1, deviation: 'stand', basic: 'hit', group: 'i18' },
  { id: '12v4', handKey: 'hard-12', hand: '12', upcard: '4', index: 0, deviation: 'stand', basic: 'hit', group: 'i18' },
  { id: '12v5', handKey: 'hard-12', hand: '12', upcard: '5', index: -2, deviation: 'stand', basic: 'hit', group: 'i18' },
  { id: '12v6', handKey: 'hard-12', hand: '12', upcard: '6', index: -1, deviation: 'stand', basic: 'hit', group: 'i18' },
  { id: '13v3', handKey: 'hard-13', hand: '13', upcard: '3', index: -2, deviation: 'stand', basic: 'hit', group: 'i18' },

  { id: '14v10s', handKey: 'hard-14', hand: '14', upcard: '10', index: 3, deviation: 'surrender', basic: 'hit', group: 'fab4' },
  { id: '15v10s', handKey: 'hard-15', hand: '15', upcard: '10', index: 0, deviation: 'surrender', basic: 'hit', group: 'fab4' },
  { id: '15v9s', handKey: 'hard-15', hand: '15', upcard: '9', index: 2, deviation: 'surrender', basic: 'hit', group: 'fab4' },
  { id: '15vAs', handKey: 'hard-15', hand: '15', upcard: 'A', index: 1, deviation: 'surrender', basic: 'hit', group: 'fab4' }
]

/** O desvio está valendo no número de decisão atual? */
export function isDeviationActive(deviation: Deviation, count: number): boolean {
  return count >= deviation.index
}

export function currentPlay(deviation: Deviation, count: number): PlayAction {
  return isDeviationActive(deviation, count) ? deviation.deviation : deviation.basic
}

/**
 * TODOS os desvios de uma célula.
 *
 * Plural porque uma célula pode ter mais de um: 15 vs 10 aparece no Fab 4
 * (render a partir de 0) e no Illustrious 18 (parar a partir de +4). Pegar só o
 * primeiro daria "render" para sempre e engoliria a transição de cima.
 */
export function deviationsForCell(
  handKey: string,
  upcard: string,
  pool: readonly Deviation[] = DEVIATIONS
): Deviation[] {
  return pool.filter((item) => item.handKey === handKey && item.upcard === upcard)
}

/**
 * Os índices publicados são de Hi-Lo. O KO tem tabela própria, com outra escala
 * (running count em torno do pivô), e reaproveitar estes números daria
 * conselho errado com cara de certo — então a lista some.
 */
export function deviationsForSystem(system: CountingSystem): readonly Deviation[] {
  return system === 'hilo' ? DEVIATIONS : []
}

/**
 * Ordena para leitura ao vivo: primeiro os que estão valendo agora (índice mais
 * alto primeiro, que é o mais "caro" de esquecer), depois os que ainda não
 * ativaram, do mais próximo de ativar ao mais distante.
 */
export function sortForCount(
  deviations: readonly Deviation[],
  count: number
): Deviation[] {
  return [...deviations].sort((a, b) => {
    const activeA = isDeviationActive(a, count)
    const activeB = isDeviationActive(b, count)
    if (activeA !== activeB) return activeA ? -1 : 1
    if (activeA) return b.index - a.index
    return a.index - b.index
  })
}
