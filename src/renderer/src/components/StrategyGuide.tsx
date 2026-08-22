import { useMemo } from 'react'

import {
  PLAY_LABELS,
  currentPlay,
  deviationsForSystem,
  isDeviationActive,
  sortForCount
} from '@shared/domain/deviations'
import type { Deviation } from '@shared/domain/deviations'
import { formatSigned } from '@shared/format'
import type { CountingSystem } from '@shared/types'

export interface StrategyGuideProps {
  system: CountingSystem
  decisionCount: number
  insuranceOn: boolean
  surrender: boolean
  /** Quantas linhas de desvio cabem. Vem da altura medida da janela. */
  maxRows: number
}

/** O seguro não é decisão de mão: sai da lista e vira a linha fixa do topo. */
const isHandDeviation = (item: Deviation): boolean => item.handKey !== null

/**
 * Uma mesma mão pode ter mais de um desvio publicado — o caso canônico é
 * 15 vs 10, que aparece no Fab 4 (render a partir de TC 0) e no Illustrious 18
 * (parar a partir de TC +4). Num count onde os dois estão ativos ao mesmo
 * tempo, mostrar as duas linhas seria mostrar duas ordens contraditórias para
 * a mesma mão ("render" e "parar" ao mesmo tempo), o que é pior do que não
 * mostrar nada num guia consultado no meio de uma jogada.
 *
 * `sortForCount` já bota os ativos primeiro (índice mais alto primeiro) e só
 * depois os inativos (índice mais próximo primeiro). Ficar com a primeira
 * ocorrência de cada `hand|upcard` nessa ordem resolve os dois casos de uma
 * vez: entre ativos, sobra o de maior índice — a mesma regra de desempate que
 * `cellDecision` usa em basicStrategy.ts, porque é a transição mais recente.
 * E se a mão já tem um desvio ativo, a duplicata inativa dela nunca aparece
 * como "próximo", que evitaria repetir a mesma mão embaixo com outro índice.
 */
function dedupeByHand(items: readonly Deviation[]): Deviation[] {
  const seen = new Set<string>()
  const out: Deviation[] = []
  for (const item of items) {
    const key = `${item.hand}|${item.upcard}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

export function StrategyGuide({
  system,
  decisionCount,
  insuranceOn,
  surrender,
  maxRows
}: StrategyGuideProps) {
  const pool = useMemo(
    () =>
      deviationsForSystem(system)
        .filter(isHandDeviation)
        .filter((item) => surrender || item.deviation !== 'surrender'),
    [system, surrender]
  )

  const sorted = useMemo(
    () => dedupeByHand(sortForCount(pool, decisionCount)),
    [pool, decisionCount]
  )
  const active = sorted.filter((item) => isDeviationActive(item, decisionCount))
  const shown = active.slice(0, maxRows)
  const hidden = active.length - shown.length
  const next = sorted.find((item) => !isDeviationActive(item, decisionCount)) ?? null

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="ui-label text-[9px]">Jogada</span>
        <span className="tnum text-[11px] text-muted">
          {system === 'hilo' ? 'TC' : 'RC'} {formatSigned(decisionCount)}
        </span>
      </div>

      <div
        data-testid="insurance"
        className={`flex items-center justify-between gap-2 rounded px-1.5 py-1 text-[10px] ${
          insuranceOn ? 'bg-warn/15 text-warn' : 'text-muted'
        }`}
      >
        <span>Seguro</span>
        <span className="font-semibold">
          {insuranceOn ? PLAY_LABELS.insurance : PLAY_LABELS.noInsurance}
        </span>
      </div>

      {system !== 'hilo' ? (
        <p className="text-[10px] leading-snug text-muted">
          Os índices publicados são de Hi-Lo. O KO tem escala própria (running count em
          torno de um pivô), então aplicar esses números ao KO daria conselho errado com
          cara de certo — aqui vale a estratégia básica.
        </p>
      ) : shown.length === 0 ? (
        <p className="text-[10px] leading-snug text-muted">
          Nada mudou: estratégia básica em todas as mãos.
        </p>
      ) : (
        <ul className="flex flex-col gap-[3px]">
          {shown.map((item) => (
            <li
              key={item.id}
              data-testid="deviation-row"
              className="flex items-baseline justify-between gap-2 text-[11px]"
            >
              <span className="tnum truncate text-muted">
                {item.hand} vs {item.upcard}
              </span>
              <span className="shrink-0 font-semibold text-pos uppercase">
                {PLAY_LABELS[currentPlay(item, decisionCount)]}
              </span>
            </li>
          ))}
          {hidden > 0 && <li className="text-[10px] text-muted">+{hidden} mais</li>}
        </ul>
      )}

      {system === 'hilo' && next !== null && (
        <p data-testid="next-index" className="tnum text-[10px] leading-snug text-muted">
          Próximo: {next.hand} vs {next.upcard} → {PLAY_LABELS[next.deviation]} em{' '}
          {formatSigned(next.index)}
        </p>
      )}
    </div>
  )
}
