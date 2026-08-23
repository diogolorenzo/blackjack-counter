import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  ALLOWED_DECK_COUNTS,
  DEFAULT_BET_SPREADS,
  DEFAULT_SETTINGS,
  OVERLAY_OPACITY_RANGE,
  OVERLAY_SIZE_LIMITS,
  SETTINGS_WRITE_DEBOUNCE_MS,
  emptyBindingProfiles
} from '@shared/defaults'
import { validateBetSpread } from '@shared/domain/betSpread'
import { clampOverlaySize } from '@shared/domain/overlaySize'
import type { SizeLimits } from '@shared/domain/overlaySize'
import type { DeepPartial } from '@shared/ipc'
import { AUTO_RESET_RANGE, HOTKEY_ACTIONS, isOptionalHotkeyAction, KEYPAD_DENSITIES } from '@shared/types'
import type {
  BankrollSettings,
  BetSpreadRule,
  BetSpreadsBySystem,
  BindingProfile,
  Corner,
  CountingSystem,
  CurrencySettings,
  DeviationsLayout,
  FeedbackSettings,
  HotkeyAction,
  OverlayLayout,
  OverlayPlacement,
  OverlaySettings,
  OverlaySize,
  Palette,
  Settings,
  ShoeConfig,
  StrategyOverlaySettings,
  TrueCountRounding
} from '@shared/types'

const CORNERS: readonly Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const OVERLAY_SIZE_VALUES: readonly OverlaySize[] = ['small', 'medium', 'large']
const OVERLAY_LAYOUTS: readonly OverlayLayout[] = ['full', 'minimal']
const ROUNDING_MODES: readonly TrueCountRounding[] = ['floor', 'nearest']
const SYSTEMS: readonly CountingSystem[] = ['hilo', 'ko']
const PALETTES: readonly Palette[] = ['default', 'colorblind']
const DEVIATIONS_LAYOUTS: readonly DeviationsLayout[] = ['list', 'matrix']

/** Nome de perfil não é dado estruturado: cortar evita um settings.json gigante. */
const PROFILE_NAME_MAX = 24

const PENETRATION_RANGE = { min: 0.5, max: 0.95 } as const
const MIN_DECKS_REMAINING_RANGE = { min: 0.25, max: 2 } as const
const HISTORY_LENGTH_RANGE = { min: 4, max: 16 } as const
const MARGIN_RANGE = { min: 0, max: 400 } as const
const VOLUME_RANGE = { min: 0, max: 1 } as const
const HANDS_PER_HOUR_RANGE = { min: 10, max: 400 } as const
const RISK_TARGET_RANGE = { min: 0.001, max: 0.9 } as const
const BANKROLL_RANGE = { min: 0, max: 1e9 } as const

/** Chaves que, atribuídas em objeto literal, alteram o protótipo — JSON externo nunca as define legitimamente. */
const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: object): Record<string, unknown> {
  return value as Record<string, unknown>
}

function mergeRecords(
  base: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const key of Object.keys(patch)) {
    if (FORBIDDEN_KEYS.has(key)) continue
    const value = patch[key]
    if (value === undefined) continue
    const current = out[key]
    out[key] =
      isPlainObject(value) && isPlainObject(current) ? mergeRecords(current, value) : value
  }
  return out
}

function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function pickNumber(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, value))
}

function pickInteger(value: unknown, min: number, max: number, fallback: number): number {
  return Math.round(pickNumber(value, min, max, fallback))
}

function pickString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

function sanitizeDeckCount(value: unknown): number {
  return typeof value === 'number' && (ALLOWED_DECK_COUNTS as readonly number[]).includes(value)
    ? value
    : DEFAULT_SETTINGS.shoe.deckCount
}

function sanitizeUnitValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_SETTINGS.unitValue
}

function cloneSpread(rules: readonly BetSpreadRule[]): BetSpreadRule[] {
  return rules.map((rule) => ({ ...rule }))
}

function sanitizeOneSpread(value: unknown, fallback: readonly BetSpreadRule[]): BetSpreadRule[] {
  if (!Array.isArray(value)) return cloneSpread(fallback)
  const rules = value.filter(isPlainObject).map((rule) => ({
    minTrueCount: Number(rule.minTrueCount),
    units: Number(rule.units)
  }))
  const { ok, normalized } = validateBetSpread(rules, fallback)
  return ok ? normalized : cloneSpread(fallback)
}

function sanitizeBetSpreads(value: unknown): BetSpreadsBySystem {
  const raw = isPlainObject(value) ? value : {}
  return {
    hilo: sanitizeOneSpread(raw.hilo, DEFAULT_BET_SPREADS.hilo),
    ko: sanitizeOneSpread(raw.ko, DEFAULT_BET_SPREADS.ko)
  }
}

/**
 * Bind vazia é legítima só nas ações opcionais. As quatro de contagem sempre
 * caem no default: um app de contagem sem tecla de contagem não é um estado que
 * o usuário possa querer, mesmo que o JSON diga que sim.
 */
function sanitizeBindings(value: unknown): Record<HotkeyAction, string> {
  const source = isPlainObject(value) ? value : {}
  const out = {} as Record<HotkeyAction, string>
  for (const action of HOTKEY_ACTIONS) {
    const accelerator = source[action]
    if (typeof accelerator === 'string' && accelerator.trim() !== '') {
      out[action] = accelerator.trim()
      continue
    }
    out[action] = isOptionalHotkeyAction(action) ? '' : DEFAULT_SETTINGS.bindings[action]
  }
  return out
}

function sanitizeShoe(value: unknown): ShoeConfig {
  const raw = isPlainObject(value) ? value : {}
  return {
    system: pickEnum(raw.system, SYSTEMS, DEFAULT_SETTINGS.shoe.system),
    surrender: pickBoolean(raw.surrender, DEFAULT_SETTINGS.shoe.surrender),
    deckCount: sanitizeDeckCount(raw.deckCount),
    penetration: pickNumber(
      raw.penetration,
      PENETRATION_RANGE.min,
      PENETRATION_RANGE.max,
      DEFAULT_SETTINGS.shoe.penetration
    ),
    trueCountRounding: pickEnum(
      raw.trueCountRounding,
      ROUNDING_MODES,
      DEFAULT_SETTINGS.shoe.trueCountRounding
    ),
    minDecksRemaining: pickNumber(
      raw.minDecksRemaining,
      MIN_DECKS_REMAINING_RANGE.min,
      MIN_DECKS_REMAINING_RANGE.max,
      DEFAULT_SETTINGS.shoe.minDecksRemaining
    )
  }
}

function sanitizeCustomPosition(value: unknown): { x: number; y: number } | null {
  if (!isPlainObject(value)) return null
  const { x, y } = value
  if (typeof x !== 'number' || typeof y !== 'number') return null
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  return { x: Math.round(x), y: Math.round(y) }
}

/**
 * Sem workArea aqui: a sanitização roda no boot, antes de qualquer janela, e
 * `screen` do Electron não pode ser importado em código compartilhado. O teto
 * dos limites já impede o caso patológico; o ajuste fino à tela acontece no
 * applyPlacement, que conhece o monitor.
 */
function sanitizeCustomSize(value: unknown, limits: SizeLimits): { width: number; height: number } | null {
  if (!isPlainObject(value)) return null
  const { width, height } = value
  if (typeof width !== 'number' || typeof height !== 'number') return null
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null
  return clampOverlaySize({ width, height }, limits, limits.max)
}

function sanitizePlacement(
  raw: Record<string, unknown>,
  fallback: OverlayPlacement,
  limits: SizeLimits
): OverlayPlacement {
  return {
    corner: pickEnum(raw.corner, CORNERS, fallback.corner),
    margin: pickInteger(raw.margin, MARGIN_RANGE.min, MARGIN_RANGE.max, fallback.margin),
    opacity: pickNumber(
      raw.opacity,
      OVERLAY_OPACITY_RANGE.min,
      OVERLAY_OPACITY_RANGE.max,
      fallback.opacity
    ),
    locked: pickBoolean(raw.locked, fallback.locked),
    visible: pickBoolean(raw.visible, fallback.visible),
    customPosition: sanitizeCustomPosition(raw.customPosition),
    customSize: sanitizeCustomSize(raw.customSize, limits)
  }
}

function sanitizeOverlay(value: unknown): OverlaySettings {
  const raw = isPlainObject(value) ? value : {}
  const fallback = DEFAULT_SETTINGS.overlay
  return {
    ...sanitizePlacement(raw, fallback, OVERLAY_SIZE_LIMITS.count),
    size: pickEnum(raw.size, OVERLAY_SIZE_VALUES, fallback.size),
    layout: pickEnum(raw.layout, OVERLAY_LAYOUTS, fallback.layout),
    historyLength: pickInteger(
      raw.historyLength,
      HISTORY_LENGTH_RANGE.min,
      HISTORY_LENGTH_RANGE.max,
      fallback.historyLength
    ),
    showCurrency: pickBoolean(raw.showCurrency, fallback.showCurrency)
  }
}

function sanitizeStrategyOverlay(value: unknown): StrategyOverlaySettings {
  const raw = isPlainObject(value) ? value : {}
  const fallback = DEFAULT_SETTINGS.strategyOverlay
  // `raw.layout` pode existir em arquivos de versões anteriores; é ignorado de
  // propósito, sem invalidar o resto do objeto.
  return {
    ...sanitizePlacement(raw, fallback, OVERLAY_SIZE_LIMITS.strategyHand),
    size: pickEnum(raw.size, OVERLAY_SIZE_VALUES, fallback.size),
    dealerFirst: pickBoolean(raw.dealerFirst, fallback.dealerFirst),
    showReason: pickBoolean(raw.showReason, fallback.showReason),
    autoResetSeconds: pickInteger(
      raw.autoResetSeconds,
      AUTO_RESET_RANGE.min,
      AUTO_RESET_RANGE.max,
      fallback.autoResetSeconds
    ),
    keypadDensity: pickEnum(raw.keypadDensity, KEYPAD_DENSITIES, fallback.keypadDensity)
  }
}

function sanitizeCurrency(value: unknown): CurrencySettings {
  const raw = isPlainObject(value) ? value : {}
  const fallback = DEFAULT_SETTINGS.currency
  const code = pickString(raw.code, fallback.code).toUpperCase()
  return {
    // Um código fora do ISO 4217 faz o Intl lançar; a checagem acontece aqui e
    // não no formatador, que roda a cada snapshot.
    code: /^[A-Z]{3}$/.test(code) ? code : fallback.code,
    locale: pickString(raw.locale, fallback.locale)
  }
}

function sanitizeBankroll(value: unknown): BankrollSettings {
  const raw = isPlainObject(value) ? value : {}
  const fallback = DEFAULT_SETTINGS.bankroll
  return {
    amount: pickNumber(raw.amount, BANKROLL_RANGE.min, BANKROLL_RANGE.max, fallback.amount),
    handsPerHour: pickInteger(
      raw.handsPerHour,
      HANDS_PER_HOUR_RANGE.min,
      HANDS_PER_HOUR_RANGE.max,
      fallback.handsPerHour
    ),
    targetRiskOfRuin: pickNumber(
      raw.targetRiskOfRuin,
      RISK_TARGET_RANGE.min,
      RISK_TARGET_RANGE.max,
      fallback.targetRiskOfRuin
    )
  }
}

function sanitizeFeedback(value: unknown): FeedbackSettings {
  const raw = isPlainObject(value) ? value : {}
  const fallback = DEFAULT_SETTINGS.feedback
  return {
    sound: pickBoolean(raw.sound, fallback.sound),
    volume: pickNumber(raw.volume, VOLUME_RANGE.min, VOLUME_RANGE.max, fallback.volume),
    flash: pickBoolean(raw.flash, fallback.flash),
    drillSound: pickBoolean(raw.drillSound, fallback.drillSound)
  }
}

/**
 * Os slots são posicionais e de tamanho fixo: um slot corrompido volta a ser
 * vazio, mas nunca some da lista, senão "Perfil 2" viraria "Perfil 1" na UI e o
 * usuário carregaria as teclas erradas.
 */
function sanitizeBindingProfiles(value: unknown): BindingProfile[] {
  const source = Array.isArray(value) ? value : []
  return emptyBindingProfiles().map((empty, index) => {
    const raw = source[index]
    if (!isPlainObject(raw)) return empty

    const name = typeof raw.name === 'string' && raw.name.trim() !== ''
      ? raw.name.trim().slice(0, PROFILE_NAME_MAX)
      : empty.name

    // Perfil sem bindings é slot vazio; com bindings, passa pela mesma
    // sanitização das teclas em vigor.
    const bindings = isPlainObject(raw.bindings) ? sanitizeBindings(raw.bindings) : null
    return { id: empty.id, name, bindings }
  })
}

/**
 * Settings da v0.1 tinham um único `betSpread` (Hi-Lo). Ele vira o spread de
 * Hi-Lo e o de KO nasce do padrão — perder o spread ajustado à mão numa
 * atualização seria a pior forma de estrear a versão nova.
 */
function migrateLegacy(raw: Record<string, unknown>): Record<string, unknown> {
  if (raw.betSpreads !== undefined || !Array.isArray(raw.betSpread)) return raw
  const { betSpread, ...rest } = raw
  return { ...rest, betSpreads: { hilo: betSpread, ko: DEFAULT_BET_SPREADS.ko } }
}

/** Merge profundo sobre os defaults + clamp de cada campo. Aceita qualquer lixo e sempre devolve Settings válido. */
function sanitizeSettings(raw: unknown): Settings {
  const source = isPlainObject(raw) ? migrateLegacy(raw) : {}
  const merged = mergeRecords(asRecord(DEFAULT_SETTINGS), source)
  return {
    shoe: sanitizeShoe(merged.shoe),
    bindings: sanitizeBindings(merged.bindings),
    hotkeysEnabled: pickBoolean(merged.hotkeysEnabled, DEFAULT_SETTINGS.hotkeysEnabled),
    betSpreads: sanitizeBetSpreads(merged.betSpreads),
    unitValue: sanitizeUnitValue(merged.unitValue),
    currency: sanitizeCurrency(merged.currency),
    bankroll: sanitizeBankroll(merged.bankroll),
    feedback: sanitizeFeedback(merged.feedback),
    palette: pickEnum(merged.palette, PALETTES, DEFAULT_SETTINGS.palette),
    deviationsLayout: pickEnum(
      merged.deviationsLayout,
      DEVIATIONS_LAYOUTS,
      DEFAULT_SETTINGS.deviationsLayout
    ),
    bindingProfiles: sanitizeBindingProfiles(merged.bindingProfiles),
    overlay: sanitizeOverlay(merged.overlay),
    strategyOverlay: sanitizeStrategyOverlay(merged.strategyOverlay)
  }
}

function readSettings(filePath: string): Settings {
  // Arquivo ausente, JSON corrompido ou shape errado caem no default em silêncio:
  // nenhuma settings ruim pode impedir o app de abrir.
  try {
    if (!existsSync(filePath)) return sanitizeSettings(null)
    return sanitizeSettings(JSON.parse(readFileSync(filePath, 'utf8')))
  } catch {
    return sanitizeSettings(null)
  }
}

/** O spread em vigor é o do sistema ativo; os dois ficam guardados lado a lado. */
export function activeBetSpread(settings: Settings): BetSpreadRule[] {
  return settings.betSpreads[settings.shoe.system] ?? settings.betSpreads.hilo
}

export class SettingsStore {
  private readonly filePath: string
  private settings: Settings
  private serialized: string
  private timer: ReturnType<typeof setTimeout> | null = null
  private pendingWrite = false

  constructor(filePath: string) {
    this.filePath = filePath
    this.settings = readSettings(filePath)
    this.serialized = JSON.stringify(this.settings)
  }

  get(): Settings {
    return this.settings
  }

  update(patch: DeepPartial<Settings>): Settings {
    this.settings = sanitizeSettings(mergeRecords(asRecord(this.settings), asRecord(patch)))
    const next = JSON.stringify(this.settings)
    if (next !== this.serialized) {
      this.serialized = next
      this.pendingWrite = true
      this.scheduleWrite()
    }
    return this.settings
  }

  flush(): void {
    this.cancelTimer()
    if (this.pendingWrite) this.writeNow()
  }

  dispose(): void {
    this.flush()
  }

  private scheduleWrite(): void {
    this.cancelTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.pendingWrite) this.writeNow()
    }, SETTINGS_WRITE_DEBOUNCE_MS)
  }

  private cancelTimer(): void {
    if (this.timer === null) return
    clearTimeout(this.timer)
    this.timer = null
  }

  private writeNow(): void {
    const tmpPath = `${this.filePath}.tmp`
    try {
      mkdirSync(dirname(this.filePath), { recursive: true })
      // Grava no .tmp e renomeia: rename é atômico, então uma queda no meio da
      // escrita nunca deixa o settings.json truncado.
      writeFileSync(tmpPath, this.serialized, 'utf8')
      renameSync(tmpPath, this.filePath)
      this.pendingWrite = false
    } catch {
      // Disco cheio ou permissão negada: perder a persistência é preferível a
      // derrubar o processo main. A próxima escrita tenta de novo.
    }
  }
}
