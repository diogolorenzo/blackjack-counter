import type { Bucket, Delta } from './types'

const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** 3 -> "+3", 0 -> "0", -2 -> "-2". */
export function formatSigned(n: number): string {
  if (!Number.isFinite(n) || n === 0) return '0'
  return n > 0 ? `+${n}` : String(n)
}

/** 2.43 -> "+2.4", 0 -> "0.0". Sempre uma casa decimal. */
export function formatTrueCount(tc: number): string {
  if (!Number.isFinite(tc)) return '0.0'
  const rounded = Math.round(tc * 10) / 10
  // -0 === 0, então o zero negativo cai aqui e nunca vira "-0.0".
  if (rounded === 0) return '0.0'
  return rounded > 0 ? `+${rounded.toFixed(1)}` : rounded.toFixed(1)
}

/** 4.512 -> "4.5". */
export function formatDecks(d: number): string {
  if (!Number.isFinite(d)) return '0.0'
  return d.toFixed(1)
}

/** 4 -> "4u". */
export function formatUnits(u: number): string {
  if (!Number.isFinite(u)) return '0u'
  return Number.isInteger(u) ? `${u}u` : `${u.toFixed(1)}u`
}

export function formatCurrency(units: number, unitValue: number): string {
  const total = units * unitValue
  return CURRENCY.format(Number.isFinite(total) ? total : 0)
}

export function bucketLabel(b: Bucket): string {
  if (b === 'low') return '2-6'
  if (b === 'high') return '10-A'
  return '7-9'
}

export function deltaToBucket(d: Delta): Bucket {
  if (d === 1) return 'low'
  if (d === -1) return 'high'
  return 'neutral'
}

export function bucketToDelta(b: Bucket): Delta {
  if (b === 'low') return 1
  if (b === 'high') return -1
  return 0
}
