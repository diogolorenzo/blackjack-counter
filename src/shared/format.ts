import type { CurrencySettings, Delta, Bucket } from './types'

/**
 * Intl.NumberFormat é caro de construir e barato de reusar, e a formatação roda
 * a cada snapshot. O cache é por (locale, moeda), que é o que o usuário muda.
 */
const currencyFormatters = new Map<string, Intl.NumberFormat>()

function currencyFormatter(currency: CurrencySettings): Intl.NumberFormat {
  const key = `${currency.locale}|${currency.code}`
  const cached = currencyFormatters.get(key)
  if (cached !== undefined) return cached

  let formatter: Intl.NumberFormat
  try {
    formatter = new Intl.NumberFormat(currency.locale, {
      style: 'currency',
      currency: currency.code
    })
  } catch {
    // Código ou locale inválido vindo do settings.json não pode derrubar a UI.
    formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
  }
  currencyFormatters.set(key, formatter)
  return formatter
}

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

export function formatMoney(amount: number, currency: CurrencySettings): string {
  return currencyFormatter(currency).format(Number.isFinite(amount) ? amount : 0)
}

export function formatCurrency(
  units: number,
  unitValue: number,
  currency: CurrencySettings
): string {
  return formatMoney(units * unitValue, currency)
}

/** 1.25 -> "+1.25%". Pontos percentuais com sinal explícito. */
export function formatPercent(pct: number, digits = 2): string {
  if (!Number.isFinite(pct)) return '—'
  const value = pct.toFixed(digits)
  return pct > 0 ? `+${value}%` : `${value}%`
}

/** 0.043 -> "4.3%". Para frações que já são proporção (risco, frequência). */
export function formatRatio(fraction: number, digits = 1): string {
  if (!Number.isFinite(fraction)) return '—'
  return `${(fraction * 100).toFixed(digits)}%`
}

/** 4500000 -> "1h 15m". Sempre a unidade maior + a seguinte. */
export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '0s'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}h ${minutes}m`
  if (minutes > 0) return `${minutes}m ${seconds}s`
  return `${seconds}s`
}

/** 12345.6 -> "12.3k". Mãos de N0 chegam à casa dos milhões. */
export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(Math.round(n))
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
