/**
 * Contrato IPC tipado. Importado por main, preload e os dois renderers, de
 * forma que nome de canal e payload sejam checados nas duas pontas.
 */
import type { RiskResult } from './domain/risk'
import type {
  AppSnapshot,
  Corner,
  Delta,
  HotkeyAction,
  HotkeyStatus,
  OverlaySize,
  Settings,
  ShoeRecord,
  UpdateStatus
} from './types'

/** Renderer -> Main, via ipcRenderer.invoke (sempre aguardado). */
export const IPC = {
  stateGet: 'state:get',
  countApply: 'count:apply',
  countUndo: 'count:undo',
  countRedo: 'count:redo',
  countNewShoe: 'count:newShoe',
  sessionAcknowledgeRestore: 'session:acknowledgeRestore',
  sessionStart: 'session:start',
  sessionEnd: 'session:end',
  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',
  hotkeysSetBinding: 'hotkeys:setBinding',
  hotkeysClearBinding: 'hotkeys:clearBinding',
  hotkeysSetCaptureMode: 'hotkeys:setCaptureMode',
  hotkeysSetEnabled: 'hotkeys:setEnabled',
  overlaySetVisible: 'overlay:setVisible',
  overlaySetLocked: 'overlay:setLocked',
  overlaySetCorner: 'overlay:setCorner',
  overlaySetSize: 'overlay:setSize',
  overlayResizeTo: 'overlay:resizeTo',
  historyGet: 'history:get',
  historySetResult: 'history:setResult',
  historyClear: 'history:clear',
  riskSimulate: 'risk:simulate',
  numLockReport: 'numlock:report',
  windowMinimize: 'window:minimize',
  windowClose: 'window:close',
  updateGetStatus: 'update:getStatus',
  updateInstall: 'update:install',
  updateDismiss: 'update:dismiss'
} as const

/** Main -> Renderer, via webContents.send (broadcast para todas as janelas). */
export const IPC_EVENTS = {
  stateChanged: 'state:changed',
  updateStatus: 'update:status'
} as const

/** Qual das duas janelas de overlay um canal endereça. */
export type OverlayKind = 'count' | 'strategy'

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
  /** Some com o aviso de sessão recuperada sem mexer na contagem. */
  acknowledgeRestore(): Promise<AppSnapshot>

  /** Abre a sessão: a partir daqui os shoes encerrados vão para o histórico. */
  startSession(): Promise<AppSnapshot>
  endSession(): Promise<AppSnapshot>

  getSettings(): Promise<Settings>
  updateSettings(patch: DeepPartial<Settings>): Promise<AppSnapshot>

  setBinding(action: HotkeyAction, accelerator: string): Promise<SetBindingResult>
  /** Só para as ações opcionais; as quatro de contagem não podem ficar sem tecla. */
  clearBinding(action: HotkeyAction): Promise<SetBindingResult>
  setCaptureMode(capturing: boolean): Promise<void>
  setHotkeysEnabled(enabled: boolean): Promise<AppSnapshot>

  setOverlayVisible(visible: boolean): Promise<AppSnapshot>
  setOverlayLocked(locked: boolean): Promise<AppSnapshot>
  setOverlayCorner(corner: Corner, margin?: number): Promise<AppSnapshot>
  setOverlaySize(size: OverlaySize): Promise<AppSnapshot>
  /** Arrasto da alça. Não devolve snapshot: a persistência vem do evento 'resized' do main. */
  resizeOverlay(kind: OverlayKind, size: { width: number; height: number }): Promise<void>

  getHistory(): Promise<ShoeRecord[]>
  setShoeResult(id: string, result: number | null): Promise<ShoeRecord[]>
  clearHistory(): Promise<ShoeRecord[]>

  /** Simula com as settings em vigor. null quando o sistema ativo não tem modelo de vantagem. */
  simulateRisk(): Promise<RiskResult | null>

  /** O renderer detecta NumLock via KeyboardEvent.getModifierState e reporta ao main. */
  reportNumLock(on: boolean): Promise<void>

  minimizeWindow(): Promise<void>
  closeWindow(): Promise<void>

  /** null = nenhuma atualização a anunciar. */
  getUpdateStatus(): Promise<UpdateStatus | null>
  installUpdate(): Promise<void>
  dismissUpdate(): Promise<void>
  /** Assina o estado da atualização. Retorna a função de unsubscribe. */
  onUpdateStatus(cb: (status: UpdateStatus | null) => void): () => void

  /** Assina o broadcast de estado. Retorna a função de unsubscribe. */
  onStateChanged(cb: (snapshot: AppSnapshot) => void): () => void
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K]
}

export type HotkeyStatusMap = Record<HotkeyAction, HotkeyStatus>
