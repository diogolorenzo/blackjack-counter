import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'

let mainWindow: BrowserWindow | null = null

function loadRenderer(win: BrowserWindow): void {
  // ELECTRON_RENDERER_URL só existe sob `electron-vite dev`; em produção o
  // renderer é um arquivo empacotado ao lado do bundle do main.
  const devUrl = process.env.ELECTRON_RENDERER_URL
  if (devUrl !== undefined && devUrl !== '') {
    void win.loadURL(devUrl)
    return
  }
  void win.loadFile(join(__dirname, '../renderer/index.html'))
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 380,
    height: 560,
    minWidth: 340,
    minHeight: 460,
    frame: false,
    resizable: true,
    autoHideMenuBar: true,
    backgroundColor: '#0b0f14',
    // Sem isto a janela pisca branca antes do primeiro paint do renderer.
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // O tick de confirmação nasce de uma hotkey global, não de um clique na
      // janela: com a política padrão o AudioContext ficaria suspenso para
      // sempre e o som nunca sairia.
      autoplayPolicy: 'no-user-gesture-required'
    }
  })

  mainWindow = win

  win.on('ready-to-show', () => {
    win.show()
  })

  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null
  })

  // A janela é frameless e sem menu: uma popup aberta pelo renderer não teria
  // barra de título nem como ser fechada. Tudo externo vai para o browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  loadRenderer(win)

  return win
}

export function getMainWindow(): BrowserWindow | null {
  if (mainWindow === null || mainWindow.isDestroyed()) return null
  return mainWindow
}
