import { useMemo, useState } from 'react'

import { HAND_ROWS, activeCells, cellDecision } from '@shared/domain/basicStrategy'
import type { Upcard } from '@shared/domain/basicStrategy'
import { PLAY_LABELS } from '@shared/domain/deviations'
import type { PlayAction } from '@shared/domain/deviations'
import { formatSigned } from '@shared/format'
import type { DecisionLanguage } from '@shared/types'

import { StrategyGrid } from './StrategyGrid'

export interface StrategyMatrixProps {
  /** True count arredondado — o mesmo número que indexa o bet spread. */
  decisionCount: number
  /** A mesa aceita rendição tardia? Muda 15 e 16 contra carta alta. */
  surrender: boolean
  /** Seguro está indicado no count atual? Vem do derivado, para não recalcular o índice aqui. */
  insuranceOn: boolean
  language: DecisionLanguage
}

interface Selection {
  handKey: string
  upcard: Upcard
}

/** Rótulo de exibição da linha, para a caixa de detalhe que só guarda a chave. */
const rowLabel = (handKey: string): string =>
  HAND_ROWS.find((row) => row.id === handKey)?.label ?? handKey

export function StrategyMatrix({
  decisionCount,
  surrender,
  insuranceOn,
  language
}: StrategyMatrixProps) {
  const [selected, setSelected] = useState<Selection | null>(null)
  const rules = useMemo(() => ({ surrender }), [surrender])
  const labels = PLAY_LABELS[language]

  const changed = useMemo(
    () => activeCells(decisionCount, rules).length,
    [decisionCount, rules]
  )

  const detail = selected === null ? null : buildDetail(selected, decisionCount, rules, labels)

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="ui-label">
          {changed === 0 ? 'Nenhuma jogada mudou' : `${changed} jogadas mudaram`}
        </span>
        <span className="tnum text-[12px] text-muted">TC {formatSigned(decisionCount)}</span>
      </div>

      <div
        className={`flex items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-[11px] ${
          insuranceOn ? 'border-warn/50 bg-warn/10 text-warn' : 'border-border bg-surface text-muted'
        }`}
      >
        <span>{language === 'en' ? 'Insurance vs ace' : 'Seguro contra ás'}</span>
        <span className="font-semibold">
          {insuranceOn ? labels.insurance : labels.noInsurance}
        </span>
      </div>

      <div className="overflow-x-auto">
        <StrategyGrid
          decisionCount={decisionCount}
          surrender={surrender}
          countAware
          selected={selected}
          onSelect={setSelected}
          language={language}
        />
      </div>

      <div className="min-h-[42px] rounded-md border border-border bg-surface px-2.5 py-2 text-[11px] leading-snug">
        {detail === null ? (
          <span className="text-muted">
            Toque numa célula para ver o índice dela. O ponto cinza marca as jogadas que a contagem
            pode mudar.
          </span>
        ) : (
          <span>{detail}</span>
        )}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
        <span>
          <b className="text-fg">P</b> {labels.hit}
        </span>
        <span>
          <b className="text-fg">F</b> {labels.stand}
        </span>
        <span>
          <b className="text-warn">D</b> {labels.double}
        </span>
        <span>
          <b className="text-pos">S</b> {labels.split}
        </span>
        <span>
          <b className="text-neg">R</b> {labels.surrender}
        </span>
      </div>

      <p className="text-[10px] leading-snug text-muted">
        6 baralhos, dealer para no 17 mole, dobra após separar
        {surrender ? ' e rendição tardia' : ', sem rendição'}. Dobrar e separar valem só nas duas
        primeiras cartas; se já pediu, dobrar vira pedir. Células verdes são as que a contagem
        mudou agora.
      </p>
    </div>
  )
}

function buildDetail(
  selection: Selection,
  count: number,
  rules: { surrender: boolean },
  labels: Record<PlayAction, string>
): string {
  const decision = cellDecision(selection.handKey, selection.upcard, count, rules)
  if (decision === null) return ''

  const label = rowLabel(selection.handKey)
  const head = `${label} vs ${selection.upcard}: ${labels[decision.action]}`
  if (decision.index === null) return `${head} — estratégia básica, a contagem não muda esta mão.`

  const missing = decision.distance
  if (missing === null) {
    return `${head} — a contagem já passou de todos os índices desta mão.`
  }

  const next = `vira outra jogada em TC ${formatSigned(decision.index)}, ${missing} ponto${
    Math.abs(missing) === 1 ? '' : 's'
  } daqui`
  return decision.deviated ? `${head} (desvio) — ${next}.` : `${head} — ${next}.`
}
