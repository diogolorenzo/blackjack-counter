import { vi } from 'vitest'

import { DEFAULT_BET_SPREADS, DEFAULT_SETTINGS } from '../src/shared/defaults'
import { computeDerived } from '../src/shared/domain/shoe'
import type { CounterApi } from '../src/shared/ipc'
import { HOTKEY_ACTIONS } from '../src/shared/types'
import type { AppSnapshot, Entry, Settings } from '../src/shared/types'

export function entries(count: number): Entry[] {
  return Array.from({ length: count }, (_, i) => ({ id: `e${i}`, delta: 1 as const, at: i }))
}

export function snapshot(patch: Partial<Settings> = {}, cards = 0): AppSnapshot {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...patch }
  const list = entries(cards)
  const status = {} as AppSnapshot['hotkeyStatus']
  for (const action of HOTKEY_ACTIONS) {
    status[action] = settings.bindings[action] === '' ? 'disabled' : 'ok'
  }

  return {
    recentEntries: [...list].reverse(),
    derived: computeDerived(list, settings.shoe, DEFAULT_BET_SPREADS[settings.shoe.system]),
    canUndo: cards > 0,
    canRedo: false,
    undoRestoresShoe: false,
    settings,
    hotkeyStatus: status,
    numLockOn: true,
    sessionRestored: false,
    session: { active: false, id: null, startedAt: null, shoes: 0 },
    shoeStats: { startedAt: 0, maxDecisionCount: 0, minDecisionCount: 0, msAtAdvantage: 0 },
    applyTick: 0,
    lastBucket: null
  }
}

/**
 * Ponte falsa para o processo main.
 *
 * O renderer inteiro depende de `window.counter`; sem este stub nem o primeiro
 * render acontece. Cada método devolve o snapshot fixo, que é o suficiente para
 * verificar o que o renderer desenha a partir dele.
 */
export function stubApi(state: AppSnapshot): CounterApi {
  const api = {
    getState: vi.fn(async () => state),
    applyCount: vi.fn(async () => state),
    undo: vi.fn(async () => state),
    redo: vi.fn(async () => state),
    newShoe: vi.fn(async () => state),
    acknowledgeRestore: vi.fn(async () => state),
    startSession: vi.fn(async () => state),
    endSession: vi.fn(async () => state),
    getSettings: vi.fn(async () => state.settings),
    updateSettings: vi.fn(async () => state),
    setBinding: vi.fn(async () => ({ ok: true, effective: 'F1' })),
    clearBinding: vi.fn(async () => ({ ok: true, effective: '' })),
    setCaptureMode: vi.fn(async () => undefined),
    setHotkeysEnabled: vi.fn(async () => state),
    setOverlayVisible: vi.fn(async () => state),
    setOverlayLocked: vi.fn(async () => state),
    setOverlayCorner: vi.fn(async () => state),
    setOverlaySize: vi.fn(async () => state),
    resizeOverlay: vi.fn(async () => undefined),
    getHistory: vi.fn(async () => []),
    setShoeResult: vi.fn(async () => []),
    clearHistory: vi.fn(async () => []),
    simulateRisk: vi.fn(async () => null),
    reportNumLock: vi.fn(async () => undefined),
    minimizeWindow: vi.fn(async () => undefined),
    closeWindow: vi.fn(async () => undefined),
    getUpdateStatus: vi.fn(async () => null),
    installUpdate: vi.fn(async () => undefined),
    dismissUpdate: vi.fn(async () => undefined),
    onUpdateStatus: vi.fn(() => () => undefined),
    onStateChanged: vi.fn(() => () => undefined)
  } satisfies CounterApi

  window.counter = api
  return api
}
