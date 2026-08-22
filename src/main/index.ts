import { join } from 'node:path'

import { app } from 'electron'
import type { BrowserWindow } from 'electron'

import { OVERLAY_SIZES, OVERLAY_SIZE_LIMITS, STRATEGY_OVERLAY_SIZES } from '@shared/defaults'
import { IPC_EVENTS } from '@shared/ipc'
import type { AppSnapshot, HotkeyAction } from '@shared/types'

import { HotkeyManager } from './hotkeys/manager'
import { registerIpcHandlers } from './ipc/handlers'
import { HistoryStore } from './state/historyStore'
import { SessionController } from './state/sessionController'
import { SessionStore } from './state/sessionStore'
import { SettingsStore } from './state/store'
import { createTray } from './tray'
import type { TrayController } from './tray'
import { createUpdaterController } from './updater/controller'
import type { UpdaterController } from './updater/controller'
import { createMainWindow, getMainWindow } from './windows/mainWindow'
import { createOverlayWindow } from './windows/overlayWindow'
import type { OverlayController } from './windows/overlayWindow'

let store: SettingsStore | null = null
let sessionStore: SessionStore | null = null
let controllerRef: SessionController | null = null
let hotkeys: HotkeyManager | null = null
let overlay: OverlayController | null = null
let strategyOverlay: OverlayController | null = null
let tray: TrayController | null = null
let updater: UpdaterController | null = null

function liveWindows(): BrowserWindow[] {
  const candidates = [
    getMainWindow(),
    overlay === null ? null : overlay.get(),
    strategyOverlay === null ? null : strategyOverlay.get()
  ]
  return candidates.filter(
    (win): win is BrowserWindow => win !== null && !win.isDestroyed() && !win.webContents.isDestroyed()
  )
}

function broadcast(snapshot: AppSnapshot): void {
  for (const win of liveWindows()) win.webContents.send(IPC_EVENTS.stateChanged, snapshot)
  tray?.update(snapshot)
}

function showMainWindow(): void {
  const existing = getMainWindow()
  const win = existing !== null && !existing.isDestroyed() ? existing : createMainWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

/** setVisible(true) já faz ensure + applyPlacement; a janela só nasce aqui. */
function applyOverlayVisibility(controller: SessionController, visible: boolean): void {
  controller.updateSettings({ overlay: { visible } })
  overlay?.setVisible(visible)
}

function toggleHotkeys(controller: SessionController, manager: HotkeyManager): void {
  const enabled = !controller.getSnapshot().settings.hotkeysEnabled
  const settings = controller.updateSettings({ hotkeysEnabled: enabled }).settings
  controller.setHotkeyStatus(manager.apply(settings.bindings, settings.hotkeysEnabled))
}

function handleHotkey(
  controller: SessionController,
  action: HotkeyAction,
  toggleOverlay: () => void
): void {
  switch (action) {
    case 'low':
      controller.apply(1)
      break
    case 'neutral':
      controller.apply(0)
      break
    case 'high':
      controller.apply(-1)
      break
    case 'undo':
      controller.undo()
      break
    case 'redo':
      controller.redo()
      break
    case 'newShoe':
      controller.newShoe()
      break
    case 'toggleOverlay':
      toggleOverlay()
      break
  }
}

function bootstrap(): void {
  // Agrupa janela e notificações sob o mesmo appId do electron-builder.
  app.setAppUserModelId('com.diogo.counter')

  const userData = app.getPath('userData')
  const settingsStore = new SettingsStore(join(userData, 'settings.json'))
  const liveSession = new SessionStore(join(userData, 'session.json'))
  const history = new HistoryStore(join(userData, 'history.json'))
  store = settingsStore
  sessionStore = liveSession

  const controller = new SessionController({
    settings: settingsStore,
    session: liveSession,
    history
  })
  controllerRef = controller

  const overlayController = createOverlayWindow({
    page: 'overlay.html',
    getPlacement: () => controller.getSnapshot().settings.overlay,
    getPresetSize: () => OVERLAY_SIZES[controller.getSnapshot().settings.overlay.size],
    getLimits: () => OVERLAY_SIZE_LIMITS.count,
    onMoved: (customPosition) => {
      controller.updateSettings({ overlay: { customPosition } })
    },
    onResized: (customSize) => {
      controller.updateSettings({ overlay: { customSize } })
    }
  })
  overlay = overlayController

  const strategyController = createOverlayWindow({
    page: 'strategy.html',
    getPlacement: () => controller.getSnapshot().settings.strategyOverlay,
    getPresetSize: () => {
      const { layout, size } = controller.getSnapshot().settings.strategyOverlay
      return STRATEGY_OVERLAY_SIZES[layout][size]
    },
    getLimits: () =>
      controller.getSnapshot().settings.strategyOverlay.layout === 'matrix'
        ? OVERLAY_SIZE_LIMITS.strategyMatrix
        : OVERLAY_SIZE_LIMITS.strategyGuide,
    onMoved: (customPosition) => {
      controller.updateSettings({ strategyOverlay: { customPosition } })
    },
    onResized: (customSize) => {
      controller.updateSettings({ strategyOverlay: { customSize } })
    }
  })
  strategyOverlay = strategyController

  const toggleOverlayVisibility = (): void => {
    applyOverlayVisibility(controller, !controller.getSnapshot().settings.overlay.visible)
  }

  const hotkeyManager = new HotkeyManager((action) =>
    handleHotkey(controller, action, toggleOverlayVisibility)
  )
  hotkeys = hotkeyManager

  createMainWindow()

  const settings = controller.getSnapshot().settings
  controller.setHotkeyStatus(hotkeyManager.apply(settings.bindings, settings.hotkeysEnabled))

  // Sem unsubscribe: o assinante vive tanto quanto o processo.
  controller.onChange(broadcast)

  registerIpcHandlers({
    controller,
    hotkeys: hotkeyManager,
    overlay: overlayController,
    strategyOverlay: strategyController,
    getMainWindow
  })

  tray = createTray({
    onShowMain: showMainWindow,
    onToggleOverlay: toggleOverlayVisibility,
    onToggleHotkeys: () => toggleHotkeys(controller, hotkeyManager),
    onNewShoe: () => {
      controller.newShoe()
    },
    onQuit: () => {
      app.quit()
    }
  })
  tray.update(controller.getSnapshot())

  if (settings.overlay.visible) overlayController.setVisible(true)
  if (settings.strategyOverlay.visible) strategyController.setVisible(true)

  updater = createUpdaterController({ getMainWindow })
}

/**
 * Uma segunda instância registraria os MESMOS globalShortcut e cada tecla
 * contaria duas vezes — a contagem ficaria silenciosamente errada, que é o pior
 * modo de falha possível para este app. Sem o lock, morre antes de criar
 * qualquer janela ou registrar qualquer hotkey.
 */
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.on('window-all-closed', () => {
    if (process.platform === 'darwin') return
    // Fechar a janela principal deixa o app vivo na bandeja; só sai de fato
    // quando não sobrou nem tray nem overlay (de qualquer um dos dois) para operá-lo.
    const overlayAlive =
      (overlay !== null && overlay.get() !== null) ||
      (strategyOverlay !== null && strategyOverlay.get() !== null)
    if (tray !== null || overlayAlive) return
    app.quit()
  })

  app.on('before-quit', () => {
    hotkeys?.dispose()
    hotkeys = null

    // O shoe em andamento primeiro: settings dá para refazer, contagem não.
    controllerRef?.flush()
    controllerRef = null

    sessionStore?.dispose()
    sessionStore = null

    overlay?.destroy()
    overlay = null

    strategyOverlay?.destroy()
    strategyOverlay = null

    // Depois dos overlays: destruí-los grava o tamanho que a alça deixou
    // pendente, e essa escrita ainda precisa de um flush para sair do debounce
    // do store antes de o processo morrer.
    store?.flush()
    store?.dispose()
    store = null

    tray?.destroy()
    tray = null

    updater?.dispose()
    updater = null
  })

  void app.whenReady().then(bootstrap)
}
