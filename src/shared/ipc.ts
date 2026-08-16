/**
 * Contrato IPC tipado. Importado por main, preload e os dois renderers, de
 * forma que nome de canal e payload sejam checados nas duas pontas.
 */
import type {
  AppSnapshot,
  Corner,
  Delta,
  HotkeyAction,
  HotkeyStatus,
  OverlaySize,
  Settings
} from './types'

/** Renderer -> Main, via ipcRenderer.invoke (sempre aguardado). */
export const IPC = {
  stateGet: 'state:get',
  countApply: 'count:apply',
  countUndo: 'count:undo',
  countRedo: 'count:redo',
  countNewShoe: 'count:newShoe',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  hotkeysSetBinding: 'hotkeys:setBinding',
  hotkeysSetCaptureMode: 'hotkeys:setCaptureMode',
  hotkeysSetEnabled: 'hotkeys:setEnabled',
  overlaySetVisible: 'overlay:setVisible',
  overlaySetLocked: 'overlay:setLocked',
  overlaySetCorner: 'overlay:setCorner',
  overlaySetSize: 'overlay:setSize',
  numLockReport: 'numlock:report',
  windowMinimize: 'window:minimize',
  windowClose: 'window:close'
} as const

/** Main -> Renderer, via webContents.send (broadcast para todas as janelas). */
export const IPC_EVENTS = {
  stateChanged: 'state:changed'
} as const

export interface SetBindingResult {
  ok: boolean
  reason?: 'conflict' | 'invalid'
  /** Accelerator efetivamente em vigor após a operação (o novo, ou o antigo em caso de rollback). */
  effective: string
}

/**
 * Superfície exposta em `window.counter` pelo preload.
 * Toda mutação devolve o AppSnapshot resultante, então o renderer que iniciou
 * a ação não precisa esperar o broadcast para atualizar.
 */
export interface CounterApi {
  getState(): Promise<AppSnapshot>
  applyCount(delta: Delta): Promise<AppSnapshot>
  undo(): Promise<AppSnapshot>
  redo(): Promise<AppSnapshot>
  newShoe(): Promise<AppSnapshot>

  getSettings(): Promise<Settings>
  updateSettings(patch: DeepPartial<Settings>): Promise<AppSnapshot>

  setBinding(action: HotkeyAction, accelerator: string): Promise<SetBindingResult>
  setCaptureMode(capturing: boolean): Promise<void>
  setHotkeysEnabled(enabled: boolean): Promise<AppSnapshot>

  setOverlayVisible(visible: boolean): Promise<AppSnapshot>
  setOverlayLocked(locked: boolean): Promise<AppSnapshot>
  setOverlayCorner(corner: Corner, margin?: number): Promise<AppSnapshot>
  setOverlaySize(size: OverlaySize): Promise<AppSnapshot>

  /** O renderer detecta NumLock via KeyboardEvent.getModifierState e reporta ao main. */
  reportNumLock(on: boolean): Promise<void>

  minimizeWindow(): Promise<void>
  closeWindow(): Promise<void>

  /** Assina o broadcast de estado. Retorna a função de unsubscribe. */
  onStateChanged(cb: (snapshot: AppSnapshot) => void): () => void
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K]
}

export type HotkeyStatusMap = Record<HotkeyAction, HotkeyStatus>
