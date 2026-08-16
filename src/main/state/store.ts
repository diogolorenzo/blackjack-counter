import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  ALLOWED_DECK_COUNTS,
  DEFAULT_BET_SPREAD,
  DEFAULT_SETTINGS,
  SETTINGS_WRITE_DEBOUNCE_MS
} from '@shared/defaults'
import { validateBetSpread } from '@shared/domain/betSpread'
import type { DeepPartial } from '@shared/ipc'
import { HOTKEY_ACTIONS } from '@shared/types'
import type {
  BetSpreadRule,
  Corner,
  HotkeyAction,
  OverlaySettings,
  OverlaySize,
  Settings,
  ShoeConfig,
  TrueCountRounding
} from '@shared/types'

const CORNERS: readonly Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const OVERLAY_SIZE_VALUES: readonly OverlaySize[] = ['small', 'medium', 'large']
const ROUNDING_MODES: readonly TrueCountRounding[] = ['floor', 'nearest']

const PENETRATION_RANGE = { min: 0.5, max: 0.95 } as const
const MIN_DECKS_REMAINING_RANGE = { min: 0.25, max: 2 } as const
const HISTORY_LENGTH_RANGE = { min: 4, max: 16 } as const
const MARGIN_RANGE = { min: 0, max: 400 } as const

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

function sanitizeBetSpread(value: unknown): BetSpreadRule[] {
  if (!Array.isArray(value)) return cloneDefaultBetSpread()
  const rules = value.filter(isPlainObject).map((rule) => ({
    minTrueCount: Number(rule.minTrueCount),
    units: Number(rule.units)
  }))
  const { ok, normalized } = validateBetSpread(rules)
  return ok ? normalized : cloneDefaultBetSpread()
}

function cloneDefaultBetSpread(): BetSpreadRule[] {
  return DEFAULT_BET_SPREAD.map((rule) => ({ ...rule }))
}

function sanitizeBindings(value: unknown): Record<HotkeyAction, string> {
  const source = isPlainObject(value) ? value : {}
  const out = {} as Record<HotkeyAction, string>
  for (const action of HOTKEY_ACTIONS) {
    const accelerator = source[action]
    out[action] =
      typeof accelerator === 'string' && accelerator.trim() !== ''
        ? accelerator.trim()
        : DEFAULT_SETTINGS.bindings[action]
  }
  return out
}

function sanitizeShoe(value: unknown): ShoeConfig {
  const raw = isPlainObject(value) ? value : {}
  return {
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

function sanitizeOverlay(value: unknown): OverlaySettings {
  const raw = isPlainObject(value) ? value : {}
  const fallback = DEFAULT_SETTINGS.overlay
  return {
    corner: pickEnum(raw.corner, CORNERS, fallback.corner),
    margin: pickInteger(raw.margin, MARGIN_RANGE.min, MARGIN_RANGE.max, fallback.margin),
    size: pickEnum(raw.size, OVERLAY_SIZE_VALUES, fallback.size),
    locked: pickBoolean(raw.locked, fallback.locked),
    visible: pickBoolean(raw.visible, fallback.visible),
    customPosition: sanitizeCustomPosition(raw.customPosition),
    historyLength: pickInteger(
      raw.historyLength,
      HISTORY_LENGTH_RANGE.min,
      HISTORY_LENGTH_RANGE.max,
      fallback.historyLength
    ),
    showCurrency: pickBoolean(raw.showCurrency, fallback.showCurrency)
  }
}

/** Merge profundo sobre os defaults + clamp de cada campo. Aceita qualquer lixo e sempre devolve Settings válido. */
function sanitizeSettings(raw: unknown): Settings {
  const merged = isPlainObject(raw) ? mergeRecords(asRecord(DEFAULT_SETTINGS), raw) : {}
  return {
    shoe: sanitizeShoe(merged.shoe),
    bindings: sanitizeBindings(merged.bindings),
    hotkeysEnabled: pickBoolean(merged.hotkeysEnabled, DEFAULT_SETTINGS.hotkeysEnabled),
    betSpread: sanitizeBetSpread(merged.betSpread),
    unitValue: sanitizeUnitValue(merged.unitValue),
    overlay: sanitizeOverlay(merged.overlay)
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
