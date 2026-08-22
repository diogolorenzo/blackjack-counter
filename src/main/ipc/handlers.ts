import { ipcMain } from 'electron'
import type { BrowserWindow } from 'electron'

import { simulateRisk } from '@shared/domain/risk'
import type { RiskResult } from '@shared/domain/risk'
import { IPC } from '@shared/ipc'
import type { DeepPartial, OverlayKind, SetBindingResult } from '@shared/ipc'
import { HOTKEY_ACTIONS, isOptionalHotkeyAction } from '@shared/types'
import type {
  AppSnapshot,
  Corner,
  Delta,
  HotkeyAction,
  OverlayPlacement,
  OverlaySettings,
  OverlaySize,
  Settings,
  ShoeRecord
} from '@shared/types'

import type { HotkeyManager } from '../hotkeys/manager'
import type { SessionController } from '../state/sessionController'
import { activeBetSpread } from '../state/store'
import type { OverlayController } from '../windows/overlayWindow'

const CORNERS: readonly Corner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']
const OVERLAY_SIZE_VALUES: readonly OverlaySize[] = ['small', 'medium', 'large']

function isDelta(value: unknown): value is Delta {
  return value === 1 || value === 0 || value === -1
}

function isHotkeyAction(value: unknown): value is HotkeyAction {
  return typeof value === 'string' && (HOTKEY_ACTIONS as readonly string[]).includes(value)
}

function isCorner(value: unknown): value is Corner {
  return typeof value === 'string' && (CORNERS as readonly string[]).includes(value)
}

function isOverlaySize(value: unknown): value is OverlaySize {
  return typeof value === 'string' && (OVERLAY_SIZE_VALUES as readonly string[]).includes(value)
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

const OVERLAY_KINDS: readonly OverlayKind[] = ['count', 'strategy']

function isOverlayKind(value: unknown): value is OverlayKind {
  return typeof value === 'string' && (OVERLAY_KINDS as readonly string[]).includes(value)
}

function asSize(value: unknown): { width: number; height: number } | null {
  if (!isPlainObject(value)) return null
  const { width, height } = value
  if (!isFiniteNumber(width) || !isFiniteNumber(height)) return null
  return { width, height }
}

function placementChanged(before: OverlayPlacement, after: OverlayPlacement): boolean {
  return (
    before.corner !== after.corner ||
    before.margin !== after.margin ||
    before.customPosition?.x !== after.customPosition?.x ||
    before.customPosition?.y !== after.customPosition?.y ||
    before.customSize?.width !== after.customSize?.width ||
    before.customSize?.height !== after.customSize?.height
  )
}

/**
 * Fronteira de confiança do processo main. Todo payload que chega aqui veio do
 * renderer e é tratado como `unknown` até passar por um type guard.
 *
 * Payload inválido devolve o snapshot atual em vez de lançar: a exceção de um
 * ipcMain.handle vira rejeição do invoke do outro lado, e derrubar a UI por um
 * argumento malformado é pior do que ignorar a chamada.
 */
export function registerIpcHandlers(deps: {
  controller: SessionController
  hotkeys: HotkeyManager
  overlay: OverlayController
  strategyOverlay: OverlayController
  getMainWindow: () => BrowserWindow | null
}): void {
  const { controller, hotkeys, overlay, strategyOverlay, getMainWindow } = deps

  const handle = (channel: string, listener: (...args: unknown[]) => unknown): void => {
    // Registrar o mesmo canal duas vezes lança; remover antes torna a função idempotente.
    ipcMain.removeHandler(channel)
    ipcMain.handle(channel, (_event, ...args: unknown[]) => listener(...args))
  }

  const syncHotkeys = (before: Settings, after: Settings): void => {
    const bindingsChanged = HOTKEY_ACTIONS.some(
      (action) => before.bindings[action] !== after.bindings[action]
    )
    if (!bindingsChanged && before.hotkeysEnabled === after.hotkeysEnabled) return
    controller.setHotkeyStatus(hotkeys.apply(after.bindings, after.hotkeysEnabled))
  }

  /**
   * `presetChanged` entra por fora porque `size` e `layout` moram nos tipos
   * concretos de cada overlay, não em OverlayPlacement — e nos dois casos eles
   * mudam o tamanho da janela.
   */
  const syncOverlay = (
    before: OverlayPlacement,
    after: OverlayPlacement,
    presetChanged: boolean,
    target: OverlayController
  ): void => {
    if (!after.visible) {
      if (before.visible) target.setVisible(false)
      return
    }

    // Ao aparecer, a janela pode ter sido criada agora e não tem nada aplicado:
    // posição e lock precisam ser reenviados mesmo que os valores não tenham mudado.
    const appearing = !before.visible
    target.ensure()
    if (appearing || presetChanged || placementChanged(before, after)) target.applyPlacement()
    if (appearing || before.locked !== after.locked) target.setLocked(after.locked)
    if (appearing) target.setVisible(true)
  }

  /**
   * Único caminho de escrita em settings: persiste e reconcilia os efeitos
   * colaterais (globalShortcut e janela de overlay) comparando antes/depois, de
   * forma que um patch genérico vindo da tela de ajustes surta o mesmo efeito
   * que os canais dedicados.
   */
  const applyPatch = (patch: DeepPartial<Settings>): AppSnapshot => {
    const before = controller.getSnapshot().settings
    const after = controller.updateSettings(patch).settings
    syncHotkeys(before, after)
    syncOverlay(
      before.overlay,
      after.overlay,
      before.overlay.size !== after.overlay.size || before.overlay.layout !== after.overlay.layout,
      overlay
    )
    syncOverlay(
      before.strategyOverlay,
      after.strategyOverlay,
      before.strategyOverlay.size !== after.strategyOverlay.size ||
        before.strategyOverlay.layout !== after.strategyOverlay.layout,
      strategyOverlay
    )
    return controller.getSnapshot()
  }

  const setBinding = (action: unknown, accelerator: unknown): SetBindingResult => {
    const settings = controller.getSnapshot().settings

    if (!isHotkeyAction(action)) {
      return { ok: false, reason: 'invalid', effective: '' }
    }

    const previous = settings.bindings[action]
    if (typeof accelerator !== 'string' || accelerator.trim() === '') {
      return { ok: false, reason: 'invalid', effective: previous }
    }

    const next = accelerator.trim()
    const normalized = next.toLowerCase()
    // Checado aqui, e não no HotkeyManager: lá o 'conflict' cairia sobre a ação
    // de ordem posterior, que pode ser justamente a que o usuário NÃO editou.
    // Ações sem tecla ('') nunca colidem entre si.
    const duplicated = HOTKEY_ACTIONS.some(
      (other) =>
        other !== action &&
        settings.bindings[other] !== '' &&
        settings.bindings[other].toLowerCase() === normalized
    )
    if (duplicated) {
      return { ok: false, reason: 'conflict', effective: previous }
    }

    const bindings = { ...settings.bindings, [action]: next }
    const status = hotkeys.apply(bindings, settings.hotkeysEnabled)

    if (status[action] === 'conflict') {
      // Rollback: o usuário não pode ficar sem bind nenhuma por ter tentado uma tecla ocupada.
      controller.setHotkeyStatus(hotkeys.apply(settings.bindings, settings.hotkeysEnabled))
      return { ok: false, reason: 'conflict', effective: previous }
    }

    controller.updateSettings({ bindings })
    controller.setHotkeyStatus(status)
    return { ok: true, effective: next }
  }

  /** Só ações opcionais podem ficar sem tecla; as de contagem não. */
  const clearBinding = (action: unknown): SetBindingResult => {
    const settings = controller.getSnapshot().settings
    if (!isHotkeyAction(action)) return { ok: false, reason: 'invalid', effective: '' }
    if (!isOptionalHotkeyAction(action)) {
      return { ok: false, reason: 'invalid', effective: settings.bindings[action] }
    }

    const bindings = { ...settings.bindings, [action]: '' }
    const status = hotkeys.apply(bindings, settings.hotkeysEnabled)
    controller.updateSettings({ bindings })
    controller.setHotkeyStatus(status)
    return { ok: true, effective: '' }
  }

  const runRiskSimulation = (): RiskResult | null => {
    const settings = controller.getSnapshot().settings
    return simulateRisk({
      system: settings.shoe.system,
      deckCount: settings.shoe.deckCount,
      penetration: settings.shoe.penetration,
      rounding: settings.shoe.trueCountRounding,
      minDecksRemaining: settings.shoe.minDecksRemaining,
      spread: activeBetSpread(settings),
      unitValue: settings.unitValue,
      bankroll: settings.bankroll.amount,
      handsPerHour: settings.bankroll.handsPerHour,
      targetRiskOfRuin: settings.bankroll.targetRiskOfRuin
    })
  }

  const setShoeResult = (id: unknown, result: unknown): ShoeRecord[] => {
    if (typeof id !== 'string' || id === '') return controller.getHistory()
    const value = result === null || result === undefined ? null : Number(result)
    return controller.setShoeResult(id, value !== null && Number.isFinite(value) ? value : null)
  }

  handle(IPC.stateGet, () => controller.getSnapshot())

  handle(IPC.countApply, (delta) =>
    isDelta(delta) ? controller.apply(delta) : controller.getSnapshot()
  )
  handle(IPC.countUndo, () => controller.undo())
  handle(IPC.countRedo, () => controller.redo())
  handle(IPC.countNewShoe, () => controller.newShoe())
  handle(IPC.sessionAcknowledgeRestore, () => controller.acknowledgeRestore())
  handle(IPC.sessionStart, () => controller.startSession())
  handle(IPC.sessionEnd, () => controller.endSession())

  handle(IPC.settingsGet, () => controller.getSnapshot().settings)
  // O cast é seguro porque o SettingsStore sanitiza campo a campo; aqui só barramos
  // o que nem objeto é.
  handle(IPC.settingsUpdate, (patch) =>
    isPlainObject(patch)
      ? applyPatch(patch as DeepPartial<Settings>)
      : controller.getSnapshot()
  )

  handle(IPC.hotkeysSetBinding, (action, accelerator) => setBinding(action, accelerator))
  handle(IPC.hotkeysClearBinding, (action) => clearBinding(action))
  handle(IPC.hotkeysSetCaptureMode, (capturing) => {
    if (typeof capturing === 'boolean') hotkeys.setCaptureMode(capturing)
  })
  handle(IPC.hotkeysSetEnabled, (enabled) =>
    typeof enabled === 'boolean' ? applyPatch({ hotkeysEnabled: enabled }) : controller.getSnapshot()
  )

  handle(IPC.overlaySetVisible, (visible) =>
    typeof visible === 'boolean'
      ? applyPatch({ overlay: { visible } })
      : controller.getSnapshot()
  )
  handle(IPC.overlaySetLocked, (locked) =>
    typeof locked === 'boolean' ? applyPatch({ overlay: { locked } }) : controller.getSnapshot()
  )
  handle(IPC.overlaySetCorner, (corner, margin) => {
    if (!isCorner(corner)) return controller.getSnapshot()
    // Escolher um canto tem que descartar a posição arrastada, senão o preset
    // seria calculado e imediatamente ignorado.
    const patch: DeepPartial<OverlaySettings> = { corner, customPosition: null }
    if (isFiniteNumber(margin)) patch.margin = margin
    return applyPatch({ overlay: patch })
  })
  handle(IPC.overlaySetSize, (size) =>
    isOverlaySize(size) ? applyPatch({ overlay: { size } }) : controller.getSnapshot()
  )
  handle(IPC.overlayResizeTo, (kind, size) => {
    const target = asSize(size)
    if (!isOverlayKind(kind) || target === null) return
    if (kind === 'count') overlay.resizeTo(target)
    else strategyOverlay.resizeTo(target)
  })

  handle(IPC.historyGet, () => controller.getHistory())
  handle(IPC.historySetResult, (id, result) => setShoeResult(id, result))
  handle(IPC.historyClear, () => controller.clearHistory())

  handle(IPC.riskSimulate, () => runRiskSimulation())

  handle(IPC.numLockReport, (on) => {
    if (typeof on === 'boolean') controller.setNumLock(on)
  })

  handle(IPC.windowMinimize, () => {
    const window = getMainWindow()
    if (window !== null && !window.isDestroyed()) window.minimize()
  })
  handle(IPC.windowClose, () => {
    const window = getMainWindow()
    if (window !== null && !window.isDestroyed()) window.close()
  })
}
