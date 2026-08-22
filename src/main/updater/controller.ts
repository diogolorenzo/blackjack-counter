import { app, dialog } from 'electron'
import type { BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'

import { shouldPromptForUpdate } from './policy'
import type { UpdatePromptState } from './policy'

// `electron-updater` é CommonJS: o import nomeado quebra no bundle ESM do
// electron-vite. Desestruturar o default funciona nos dois formatos.
const { autoUpdater } = electronUpdater

/** Tempo até a primeira checagem: deixa a janela e os hotkeys subirem antes. */
const FIRST_CHECK_DELAY_MS = 30_000
/** O app vive dias na bandeja, então rechecar é o que mantém ele em dia. */
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export interface UpdaterController {
  dispose(): void
}

export function createUpdaterController(deps: {
  getMainWindow: () => BrowserWindow | null
}): UpdaterController {
  // Em `electron-vite dev` não existe app empacotado nem app-update.yml: checar
  // aqui só produziria erro a cada boot de desenvolvimento.
  if (!app.isPackaged) return { dispose: () => {} }

  const state: UpdatePromptState = {
    pendingVersion: null,
    dismissed: false,
    promptOpen: false,
    mainWindowFocused: false
  }

  let firstCheck: NodeJS.Timeout | null = null
  let recheck: NodeJS.Timeout | null = null
  let disposed = false

  function mainWindowFocused(): boolean {
    const win = deps.getMainWindow()
    return win !== null && win.isFocused()
  }

  function promptRestart(): void {
    const win = deps.getMainWindow()
    if (win === null) return

    const version = state.pendingVersion
    state.promptOpen = true

    // Preso à janela principal: o diálogo não vira uma janela solta que possa
    // aparecer por cima do jogo.
    void dialog
      .showMessageBox(win, {
        type: 'info',
        title: 'Atualização disponível',
        message: `A versão ${version} do Counter está pronta para instalar.`,
        detail:
          'O app reinicia sozinho e volta com a nova versão. Sua contagem atual será perdida.',
        buttons: ['Reiniciar agora', 'Depois'],
        defaultId: 0,
        cancelId: 1,
        noLink: true
      })
      .then(({ response }) => {
        state.promptOpen = false
        if (response !== 0) {
          // Não insiste: o autoInstallOnAppQuit aplica no próximo encerramento.
          state.dismissed = true
          return
        }
        // Silencioso (sem o assistente do NSIS) e reabrindo o app depois.
        autoUpdater.quitAndInstall(true, true)
      })
      .catch(() => {
        state.promptOpen = false
      })
  }

  function maybePrompt(): void {
    if (disposed) return
    state.mainWindowFocused = mainWindowFocused()
    if (shouldPromptForUpdate(state)) promptRestart()
  }

  function check(): void {
    // Sem rede o updater rejeita; o catch mantém o app em silêncio.
    autoUpdater.checkForUpdates().catch(() => {})
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    state.pendingVersion = info.version
    state.dismissed = false
    maybePrompt()
  })

  // Falha de atualização nunca vira popup: o app tem que abrir e contar cartas
  // mesmo offline ou com o GitHub fora do ar.
  autoUpdater.on('error', () => {})

  // Evento global: pega a janela principal recriada pela bandeja sem que
  // mainWindow.ts precise saber que o updater existe.
  app.on('browser-window-focus', maybePrompt)

  firstCheck = setTimeout(check, FIRST_CHECK_DELAY_MS)
  recheck = setInterval(check, CHECK_INTERVAL_MS)

  return {
    dispose: () => {
      disposed = true
      if (firstCheck !== null) clearTimeout(firstCheck)
      if (recheck !== null) clearInterval(recheck)
      firstCheck = null
      recheck = null
      app.removeListener('browser-window-focus', maybePrompt)
      autoUpdater.removeAllListeners()
    }
  }
}
