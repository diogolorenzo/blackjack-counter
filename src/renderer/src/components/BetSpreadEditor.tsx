import { useState } from 'react'

import { BET_SPREAD_FLOOR } from '@shared/defaults'
import { validateBetSpread } from '@shared/domain/betSpread'
import type { BetSpreadRule } from '@shared/types'

export interface BetSpreadEditorProps {
  rules: readonly BetSpreadRule[]
  onChange: (rules: BetSpreadRule[]) => void
}

interface DraftRule {
  key: number
  minTrueCount: string
  units: string
}

const INPUT_CLASS =
  'tnum h-6 w-16 select-text rounded border border-border bg-bg px-1.5 text-right text-[12px] text-fg outline-none focus:border-muted [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none'

let nextKey = 0

function toDraft(rules: readonly BetSpreadRule[]): DraftRule[] {
  return rules.map((rule) => ({
    key: nextKey++,
    minTrueCount: String(rule.minTrueCount),
    units: String(rule.units)
  }))
}

function signature(rules: readonly BetSpreadRule[]): string {
  return rules.map((rule) => `${rule.minTrueCount}:${rule.units}`).join('|')
}

function parseNumber(raw: string): number {
  return raw.trim() === '' ? Number.NaN : Number(raw)
}

function parseDraft(draft: readonly DraftRule[]): BetSpreadRule[] {
  return draft.map((row) => ({
    minTrueCount: parseNumber(row.minTrueCount),
    units: parseNumber(row.units)
  }))
}

/**
 * O rascunho é de strings para o campo aceitar estados intermediários ("-", "")
 * sem que cada tecla vire um número inválido. A gravação acontece no blur, e não
 * a cada tecla, porque validateBetSpread reordena as regras — reordenar embaixo
 * do cursor tiraria o foco do campo no meio da digitação.
 */
export function BetSpreadEditor({ rules, onChange }: BetSpreadEditorProps) {
  const incoming = signature(rules)
  const [applied, setApplied] = useState(incoming)
  const [draft, setDraft] = useState<DraftRule[]>(() => toDraft(rules))
  const [errors, setErrors] = useState<string[]>([])

  if (applied !== incoming) {
    setApplied(incoming)
    setDraft(toDraft(rules))
    setErrors([])
  }

  const commit = (next: readonly DraftRule[]): void => {
    const result = validateBetSpread(parseDraft(next))
    setErrors(result.errors)
    if (!result.ok) return
    onChange(result.normalized)
  }

  const editRow = (key: number, field: 'minTrueCount' | 'units', value: string): void => {
    setDraft((current) =>
      current.map((row) => {
        if (row.key !== key) return row
        return field === 'minTrueCount' ? { ...row, minTrueCount: value } : { ...row, units: value }
      })
    )
  }

  const removeRow = (key: number): void => {
    const next = draft.filter((row) => row.key !== key)
    setDraft(next)
    commit(next)
  }

  const addRow = (): void => {
    const parsed = parseDraft(draft).filter((rule) => Number.isFinite(rule.minTrueCount))
    const topTrueCount = parsed.reduce(
      (max, rule) => Math.max(max, rule.minTrueCount),
      BET_SPREAD_FLOOR
    )
    const topUnits = parsed.reduce(
      (max, rule) => Math.max(max, Number.isFinite(rule.units) ? rule.units : 0),
      1
    )
    const next: DraftRule[] = [
      { key: nextKey++, minTrueCount: String(topTrueCount + 1), units: String(topUnits * 2) },
      ...draft
    ]
    setDraft(next)
    commit(next)
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="ui-label flex items-center justify-between gap-2">
        <span>True count</span>
        <span>Unidades</span>
      </div>

      {draft.map((row) => {
        const isFloor = parseNumber(row.minTrueCount) === BET_SPREAD_FLOOR

        return (
          <div key={row.key} className="flex items-center gap-2">
            {isFloor ? (
              <span className="flex h-6 flex-1 items-center text-[12px] text-muted">
                abaixo de tudo (base)
              </span>
            ) : (
              <div className="flex flex-1 items-center gap-1.5">
                <span className="text-[12px] text-muted">a partir de</span>
                <input
                  type="number"
                  step={1}
                  className={INPUT_CLASS}
                  value={row.minTrueCount}
                  aria-label="True count mínimo"
                  onChange={(event) => editRow(row.key, 'minTrueCount', event.target.value)}
                  onBlur={() => commit(draft)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                  }}
                />
              </div>
            )}

            <input
              type="number"
              step={1}
              min={1}
              className={INPUT_CLASS}
              value={row.units}
              aria-label="Unidades"
              onChange={(event) => editRow(row.key, 'units', event.target.value)}
              onBlur={() => commit(draft)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur()
              }}
            />

            <button
              type="button"
              // A regra de piso é o fallback do lookup: sem ela um TC baixo não
              // casaria com regra nenhuma.
              disabled={isFloor}
              onClick={() => removeRow(row.key)}
              aria-label="Remover faixa"
              title={isFloor ? 'A faixa base não pode ser removida' : 'Remover faixa'}
              className="h-6 w-6 shrink-0 rounded border border-border text-muted transition-colors duration-100 hover:border-neg/50 hover:text-neg disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted"
            >
              <svg viewBox="0 0 10 10" aria-hidden="true" className="mx-auto h-2.5 w-2.5">
                <path d="M2 5h6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )
      })}

      <button
        type="button"
        onClick={addRow}
        className="h-7 rounded-md border border-border bg-bg text-[11px] text-muted transition-colors duration-100 hover:text-fg"
      >
        Adicionar faixa
      </button>

      {errors.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-[10px] leading-snug text-neg">
          {errors.map((error) => (
            <li key={error}>{error}</li>
          ))}
        </ul>
      )}
    </div>
  )
}
