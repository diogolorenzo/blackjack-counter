import { useMemo, useState } from 'react'

import {
  HAND_ROWS,
  KIND_LABELS,
  UPCARDS,
  cellDecision
} from '@shared/domain/basicStrategy'
import type { HandKind, HandRow, Upcard } from '@shared/domain/basicStrategy'
import { PLAY_CODES, PLAY_LABELS, deviationsForCell } from '@shared/domain/deviations'
import type { PlayAction } from '@shared/domain/deviations'
import { formatSigned } from '@shared/format'

export interface StrategyMatrixProps {
  /** True count arredondado — o mesmo número que indexa o bet spread. */
  decisionCount: number
  /** A mesa aceita rendição tardia? Muda 15 e 16 contra carta alta. */
  surrender: boolean
  /** Seguro está indicado no count atual? Vem do derivado, para não recalcular o índice aqui. */
  insuranceOn: boolean
}

const KIND_ORDER: readonly HandKind[] = ['hard', 'soft', 'pair']

/** Cor por jogada. O olho procura a cor primeiro e lê a letra depois. */
const ACTION_TONE: Record<PlayAction, string> = {
  hit: 'text-muted',
  stand: 'text-fg',
  double: 'text-warn',
  split: 'text-pos',
  surrender: 'text-neg',
  insurance: 'text-warn',
  noInsurance: 'text-muted'
}

interface Selection {
  row: HandRow
  upcard: Upcard
}

export function StrategyMatrix({ decisionCount, surrender, insuranceOn }: StrategyMatrixProps) {
  const [selected, setSelected] = useState<Selection | null>(null)
  const rules = useMemo(() => ({ surrender }), [surrender])

  const grid = useMemo(
    () =>
      HAND_ROWS.map((row) => ({
        row,
        cells: UPCARDS.map((upcard) => ({
          upcard,
          decision: cellDecision(row.id, upcard, decisionCount, rules),
          hasDeviation: deviationsForCell(row.id, upcard).length > 0
        }))
      })),
    [decisionCount, rules]
  )

  const changed = grid.reduce(
    (total, line) => total + line.cells.filter((cell) => cell.decision?.deviated === true).length,
    0
  )

  const detail = selected === null ? null : buildDetail(selected, decisionCount, rules)

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
        <span>Seguro contra ás</span>
        <span className="font-semibold">
          {insuranceOn ? PLAY_LABELS.insurance : PLAY_LABELS.noInsurance}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-separate border-spacing-[2px] text-[11px]">
          <thead>
            <tr>
              <th className="ui-label w-[36px] text-left font-normal">Mão</th>
              {UPCARDS.map((upcard) => (
                <th key={upcard} className="ui-label w-[26px] text-center font-normal">
                  {upcard}
                </th>
              ))}
            </tr>
          </thead>

          {KIND_ORDER.map((kind) => (
            <tbody key={kind}>
              <tr>
                <td colSpan={UPCARDS.length + 1} className="pt-1.5 pb-0.5">
                  <span className="ui-label">{KIND_LABELS[kind]}</span>
                </td>
              </tr>

              {grid
                .filter((line) => line.row.kind === kind)
                .map((line) => (
                  <tr key={line.row.id}>
                    <th className="tnum text-left text-[11px] font-normal text-muted">
                      {line.row.label}
                    </th>

                    {line.cells.map((cell) => {
                      const action = cell.decision?.action ?? 'hit'
                      const deviated = cell.decision?.deviated === true
                      const isSelected =
                        selected?.row.id === line.row.id && selected.upcard === cell.upcard

                      return (
                        <td key={cell.upcard} className="p-0">
                          <button
                            type="button"
                            onClick={() =>
                              setSelected(
                                isSelected ? null : { row: line.row, upcard: cell.upcard }
                              )
                            }
                            aria-label={`${line.row.label} contra ${cell.upcard}: ${PLAY_LABELS[action]}`}
                            className={`tnum relative flex h-5 w-full items-center justify-center rounded-[3px] border font-semibold transition-colors duration-100 ${
                              deviated
                                ? 'border-pos bg-pos/20 text-pos'
                                : isSelected
                                  ? `border-muted bg-fg/10 ${ACTION_TONE[action]}`
                                  : `border-transparent bg-surface ${ACTION_TONE[action]}`
                            }`}
                          >
                            {PLAY_CODES[action]}
                            {cell.hasDeviation && !deviated && (
                              <span
                                aria-hidden="true"
                                className="absolute right-[1px] top-[1px] h-[3px] w-[3px] rounded-full bg-muted"
                              />
                            )}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
            </tbody>
          ))}
        </table>
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
          <b className="text-fg">P</b> pedir
        </span>
        <span>
          <b className="text-fg">F</b> ficar
        </span>
        <span>
          <b className="text-warn">D</b> dobrar
        </span>
        <span>
          <b className="text-pos">S</b> separar
        </span>
        <span>
          <b className="text-neg">R</b> render
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
  rules: { surrender: boolean }
): string {
  const decision = cellDecision(selection.row.id, selection.upcard, count, rules)
  if (decision === null) return ''

  const head = `${selection.row.label} vs ${selection.upcard}: ${PLAY_LABELS[decision.action]}`
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
