import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'

import { IPC, IPC_EVENTS } from '@shared/ipc'
import type { CounterApi } from '@shared/ipc'
import type { AppSnapshot } from '@shared/types'

/**
 * Superfície mínima exposta ao renderer. `ipcRenderer` cru nunca atravessa a
 * ponte: com contextIsolation ligado, expor o objeto inteiro devolveria ao
 * renderer a capacidade de falar em qualquer canal do main.
 */
const api: CounterApi = {
  getState: () => ipcRenderer.invoke(IPC.stateGet),
  applyCount: (delta) => ipcRenderer.invoke(IPC.countApply, delta),
  undo: () => ipcRenderer.invoke(IPC.countUndo),
  redo: () => ipcRenderer.invoke(IPC.countRedo),
  newShoe: () => ipcRenderer.invoke(IPC.countNewShoe),
  acknowledgeRestore: () => ipcRenderer.invoke(IPC.sessionAcknowledgeRestore),
  startSession: () => ipcRenderer.invoke(IPC.sessionStart),
  endSession: () => ipcRenderer.invoke(IPC.sessionEnd),

  getSettings: () => ipcRenderer.invoke(IPC.settingsGet),
  updateSettings: (patch) => ipcRenderer.invoke(IPC.settingsUpdate, patch),

  setBinding: (action, accelerator) =>
    ipcRenderer.invoke(IPC.hotkeysSetBinding, action, accelerator),
  clearBinding: (action) => ipcRenderer.invoke(IPC.hotkeysClearBinding, action),
  setCaptureMode: (capturing) => ipcRenderer.invoke(IPC.hotkeysSetCaptureMode, capturing),
  setHotkeysEnabled: (enabled) => ipcRenderer.invoke(IPC.hotkeysSetEnabled, enabled),

  setOverlayVisible: (visible) => ipcRenderer.invoke(IPC.overlaySetVisible, visible),
  setOverlayLocked: (locked) => ipcRenderer.invoke(IPC.overlaySetLocked, locked),
  setOverlayCorner: (corner, margin) => ipcRenderer.invoke(IPC.overlaySetCorner, corner, margin),
  setOverlaySize: (size) => ipcRenderer.invoke(IPC.overlaySetSize, size),
  resizeOverlay: (kind, size) => ipcRenderer.invoke(IPC.overlayResizeTo, kind, size),

  getHistory: () => ipcRenderer.invoke(IPC.historyGet),
  setShoeResult: (id, result) => ipcRenderer.invoke(IPC.historySetResult, id, result),
  clearHistory: () => ipcRenderer.invoke(IPC.historyClear),

  simulateRisk: () => ipcRenderer.invoke(IPC.riskSimulate),

  reportNumLock: (on) => ipcRenderer.invoke(IPC.numLockReport, on),

  minimizeWindow: () => ipcRenderer.invoke(IPC.windowMinimize),
  closeWindow: () => ipcRenderer.invoke(IPC.windowClose),

  onStateChanged: (cb: (snapshot: AppSnapshot) => void) => {
    const listener = (_event: IpcRendererEvent, snapshot: AppSnapshot): void => cb(snapshot)
    ipcRenderer.on(IPC_EVENTS.stateChanged, listener)
    // Devolver o unsubscribe não é conveniência: sem ele, cada hot reload do
    // renderer deixa o listener anterior vivo e o broadcast passa a re-renderizar
    // N vezes.
    return () => {
      ipcRenderer.removeListener(IPC_EVENTS.stateChanged, listener)
    }
  }
}

contextBridge.exposeInMainWorld('counter', api)
