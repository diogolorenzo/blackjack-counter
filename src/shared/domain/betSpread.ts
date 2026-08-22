import type { BetSpreadRule } from '../types'
import { BET_SPREAD_FLOOR, DEFAULT_BET_SPREAD } from '../defaults'

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

/**
 * Unidades para o número de decisão dado (true count no Hi-Lo, running count no
 * KO): a regra de maior minTrueCount que ainda seja <= o número. Equivale a
 * ordenar decrescente e pegar a primeira que casa, sem alocar — isto roda a
 * cada snapshot.
 */
export function lookupUnits(count: number, spread: readonly BetSpreadRule[]): number {
  let match: BetSpreadRule | undefined
  for (const rule of spread) {
    if (!isFiniteNumber(rule?.minTrueCount)) continue
    if (rule.minTrueCount > count) continue
    if (match === undefined || rule.minTrueCount > match.minTrueCount) match = rule
  }
  return match === undefined ? 1 : match.units
}

/**
 * Valida e normaliza um bet spread vindo do usuário ou do settings.json.
 *
 * `normalized` é SEMPRE utilizável: ordenado decrescente e com uma regra de piso
 * garantida, para que lookupUnits nunca caia no fallback. Entrada irrecuperável
 * vira o `fallback` (o spread padrão do sistema em questão).
 */
export function validateBetSpread(
  rules: readonly BetSpreadRule[],
  fallback: readonly BetSpreadRule[] = DEFAULT_BET_SPREAD
): {
  ok: boolean
  errors: string[]
  normalized: BetSpreadRule[]
} {
  const errors: string[] = []
  const usable: BetSpreadRule[] = []
  const seen = new Set<number>()

  if (!Array.isArray(rules) || rules.length === 0) {
    errors.push('O bet spread precisa de pelo menos uma regra.')
  } else {
    for (const rule of rules) {
      const minTrueCount = rule?.minTrueCount
      const units = rule?.units

      if (!isFiniteNumber(minTrueCount)) {
        errors.push(`Contagem mínima inválida: ${String(minTrueCount)}.`)
        continue
      }
      if (!isFiniteNumber(units) || units <= 0) {
        errors.push(`units precisa ser um número finito maior que zero (contagem ${minTrueCount}).`)
        continue
      }
      if (seen.has(minTrueCount)) {
        errors.push(`Contagem mínima duplicada: ${minTrueCount}.`)
        continue
      }

      seen.add(minTrueCount)
      usable.push({ minTrueCount, units })
    }
  }

  if (usable.length === 0) {
    return { ok: false, errors, normalized: fallback.map((rule) => ({ ...rule })) }
  }

  const normalized = usable.sort((a, b) => b.minTrueCount - a.minTrueCount)
  const lowest = normalized[normalized.length - 1]
  if (lowest !== undefined && lowest.minTrueCount > BET_SPREAD_FLOOR) {
    normalized.push({ minTrueCount: BET_SPREAD_FLOOR, units: 1 })
  }

  return { ok: errors.length === 0, errors, normalized }
}
