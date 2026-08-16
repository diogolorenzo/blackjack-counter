import { join } from 'node:path'

import { app } from 'electron'
import type { BrowserWindow, Tray } from 'electron'

import { IPC_EVENTS } from '@shared/ipc'
import type { AppSnapshot, HotkeyAction } from '@shared/types'

import { HotkeyManager } from './hotkeys/manager'
import { registerIpcHandlers } from './ipc/handlers'
import { SessionController } from './state/sessionController'
import { SettingsStore } from './state/store'
import { createTray } from './tray'
import { createMainWindow, getMainWindow } from './windows/mainWindow'
import { createOverlayController } from './windows/overlayWindow'
import type { OverlayController } from './windows/overlayWindow'

let store: SettingsStore | null = null
let hotkeys: HotkeyManager | null = null
let overlay: OverlayController | null = null
let tray: Tray | null = null

function liveWindows(): BrowserWindow[] {
  const candidates = [getMainWindow(), overlay === null ? null : overlay.get()]
  return candidates.filter(
    (win): win is BrowserWindow => win !== null && !win.isDestroyed() && !win.webContents.isDestroyed()
  )
}

function broadcast(snapshot: AppSnapshot): void {
  for (const win of liveWindows()) win.webContents.send(IPC_EVENTS.stateChanged, snapshot)
}

function showMainWindow(): void {
  const existing = getMainWindow()
  const win = existing !== null && !existing.isDestroyed() ? existing : createMainWindow()
  if (win.isMinimized()) win.restore()
  win.show()
  win.focus()
}

function handleHotkey(controller: SessionController, action: HotkeyAction): void {
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
  }
}

/** setVisible(true) já faz ensure + applyPlacement; a janela só nasce aqui. */
function applyOverlayVisibility(controller: SessionController, visible: boolean): void {
  controller.updateSettings({ overlay: { visible } })
  overlay?.setVisible(visible)
}

function bootstrap(): void {
  // Agrupa janela e notificações sob o mesmo appId do electron-builder.
  app.setAppUserModelId('com.diogo.counter')

  const settingsStore = new SettingsStore(join(app.getPath('userData'), 'settings.json'))
  store = settingsStore

  const controller = new SessionController(settingsStore)

  const hotkeyManager = new HotkeyManager((action) => handleHotkey(controller, action))
  hotkeys = hotkeyManager

  const overlayController = createOverlayController(
    () => controller.getSnapshot().settings,
    (position) => {
      controller.updateSettings({ overlay: { customPosition: position } })
    }
  )
  overlay = overlayController

  createMainWindow()

  const settings = controller.getSnapshot().settings
  controller.setHotkeyStatus(hotkeyManager.apply(settings.bindings, settings.hotkeysEnabled))

  // Sem unsubscribe: o assinante vive tanto quanto o processo.
  controller.onChange(broadcast)

  registerIpcHandlers({
    controller,
    hotkeys: hotkeyManager,
    overlay: overlayController,
    getMainWindow
  })

  tray = createTray({
    onShowMain: showMainWindow,
    onToggleOverlay: () => {
      applyOverlayVisibility(controller, !controller.getSnapshot().settings.overlay.visible)
    },
    onNewShoe: () => {
      controller.newShoe()
    },
    onQuit: () => {
      app.quit()
    }
  })

  if (settings.overlay.visible) overlayController.setVisible(true)
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
    // quando não sobrou nem tray nem overlay para operá-lo.
    const overlayAlive = overlay !== null && overlay.get() !== null
    if (tray !== null || overlayAlive) return
    app.quit()
  })

  app.on('before-quit', () => {
    hotkeys?.dispose()
    hotkeys = null

    store?.flush()
    store?.dispose()
    store = null

    overlay?.destroy()
    overlay = null

    tray?.destroy()
    tray = null
  })

  void app.whenReady().then(bootstrap)
}
