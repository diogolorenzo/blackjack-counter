import { useMemo } from 'react'

import {
  HAND_ROWS,
  KIND_LABELS,
  UPCARDS,
  basicAction,
  cellDecision
} from '@shared/domain/basicStrategy'
import type { HandKind, Upcard } from '@shared/domain/basicStrategy'
import { PLAY_CODES, PLAY_LABELS, deviationsForCell } from '@shared/domain/deviations'
import type { PlayAction } from '@shared/domain/deviations'

export interface StrategyGridProps {
  /** True count arredondado — o mesmo número que indexa o bet spread. */
  decisionCount: number
  /** A mesa aceita rendição tardia? Muda 15 e 16 contra carta alta. */
  surrender: boolean
  /** false no KO: só básica, sem índices e sem destaque. */
  countAware: boolean
  /** Reduz altura de célula e espaçamento para caber num overlay. */
  compact?: boolean
  selected?: { handKey: string; upcard: Upcard } | null
  onSelect?: (cell: { handKey: string; upcard: Upcard } | null) => void
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

export function StrategyGrid({
  decisionCount,
  surrender,
  countAware,
  compact = false,
  selected = null,
  onSelect
}: StrategyGridProps) {
  const rules = useMemo(() => ({ surrender }), [surrender])

  const grid = useMemo(() => {
    /**
     * `countAware` false = KO. Os índices publicados são de Hi-Lo e a escala
     * do KO é outra; a grade cai em `basicAction` puro, sem destaque de
     * desvio e sem o pontinho de "a contagem mexe aqui".
     */
    const decisionFor = (handKey: string, upcard: Upcard) =>
      countAware
        ? cellDecision(handKey, upcard, decisionCount, rules)
        : {
            action: basicAction(handKey, upcard, rules) ?? 'hit',
            deviated: false,
            index: null,
            distance: null
          }

    return HAND_ROWS.map((row) => ({
      row,
      cells: UPCARDS.map((upcard) => ({
        upcard,
        decision: decisionFor(row.id, upcard),
        hasDeviation: deviationsForCell(row.id, upcard).length > 0
      }))
    }))
  }, [decisionCount, rules, countAware])

  return (
    <table
      className={`w-full border-separate text-[11px] ${
        compact ? 'border-spacing-[1px]' : 'border-spacing-[2px]'
      }`}
    >
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
                    selected?.handKey === line.row.id && selected.upcard === cell.upcard

                  return (
                    <td key={cell.upcard} className="p-0">
                      <button
                        type="button"
                        disabled={onSelect === undefined}
                        onClick={() =>
                          onSelect?.(isSelected ? null : { handKey: line.row.id, upcard: cell.upcard })
                        }
                        aria-label={`${line.row.label} contra ${cell.upcard}: ${PLAY_LABELS[action]}`}
                        className={`tnum relative flex w-full items-center justify-center rounded-[3px] border font-semibold transition-colors duration-100 ${
                          compact ? 'h-4' : 'h-5'
                        } ${
                          deviated
                            ? 'border-pos bg-pos/20 text-pos'
                            : isSelected
                              ? `border-muted bg-fg/10 ${ACTION_TONE[action]}`
                              : `border-transparent bg-surface ${ACTION_TONE[action]}`
                        }`}
                      >
                        {PLAY_CODES[action]}
                        {countAware && cell.hasDeviation && !deviated && (
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
  )
}
