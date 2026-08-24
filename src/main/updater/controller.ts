import { app } from 'electron'
import electronUpdater from 'electron-updater'

import { shouldCheck, visibleStatus } from './policy'
import { createSimulatedUpdater, fakeVersionFrom } from './simulator'
import type { UpdateState } from './policy'
import type { UpdateStatus } from '@shared/types'

// `electron-updater` é CommonJS: o import nomeado quebra no bundle ESM do
// electron-vite. Desestruturar o default funciona nos dois formatos.
const { autoUpdater } = electronUpdater

/** Tempo até a primeira checagem: deixa a janela e os hotkeys subirem antes. */
const FIRST_CHECK_DELAY_MS = 10_000
/** O app vive dias na bandeja, então rechecar é o que mantém ele em dia. */
const CHECK_INTERVAL_MS = 30 * 60 * 1000
/**
 * Piso entre checagens disparadas por foco ou pelo timer periódico. Alt-tab é
 * frequente; sem o piso, cada volta para o app viraria um GET. Com o intervalo
 * de 30min do timer, o piso de 5min nunca chega a barrar uma checagem
 * periódica legítima — só existe para o caminho de foco, mas os dois
 * compartilham a mesma política.
 */
const MIN_CHECK_GAP_MS = 5 * 60 * 1000

export interface UpdaterController {
  install(): void
  dismiss(): void
  status(): UpdateStatus | null
  dispose(): void
}

export function createUpdaterController(deps: {
  broadcast: (status: UpdateStatus | null) => void
}): UpdaterController {
  const state: UpdateState = {
    phase: 'idle',
    version: null,
    percent: 0,
    dismissed: false,
    lastCheckAt: null
  }

  // Em `electron-vite dev` não existe app empacotado nem app-update.yml: checar
  // aqui só produziria erro a cada boot de desenvolvimento. Com
  // COUNTER_FAKE_UPDATE o simulador entra no lugar, para conferir o visual da
  // pílula sem depender de uma release publicada.
  if (!app.isPackaged) {
    const fake = fakeVersionFrom(process.env.COUNTER_FAKE_UPDATE)
    if (fake !== null) {
      return createSimulatedUpdater({ broadcast: deps.broadcast, version: fake })
    }
    return {
      install: () => {},
      dismiss: () => {},
      status: () => null,
      dispose: () => {}
    }
  }

  let firstCheck: NodeJS.Timeout | null = null
  let recheck: NodeJS.Timeout | null = null
  let disposed = false

  function emit(): void {
    if (disposed) return
    deps.broadcast(visibleStatus(state))
  }

  function check(): void {
    if (disposed) return
    state.lastCheckAt = Date.now()
    if (state.phase === 'idle' || state.phase === 'error') state.phase = 'checking'
    // Sem rede o updater rejeita; o catch mantém o app em silêncio.
    autoUpdater.checkForUpdates().catch(() => {
      state.phase = 'error'
      emit()
    })
  }

  /**
   * Consulta a política antes de checar. Usada tanto pelo foco quanto pelo
   * timer periódico: sem isso, o timer atravessaria a regra de shouldCheck e
   * bateria no GitHub a cada 30min mesmo com a atualização pronta ou já
   * baixando.
   */
  function checkIfDue(): void {
    if (!shouldCheck(state, Date.now(), MIN_CHECK_GAP_MS)) return
    check()
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    state.phase = 'downloading'
    state.version = info.version
    state.percent = 0
    // Pendência nova desarma o "dispensar" da anterior: é outra versão.
    state.dismissed = false
    emit()
  })

  autoUpdater.on('update-not-available', () => {
    if (state.phase === 'checking') state.phase = 'idle'
    emit()
  })

  autoUpdater.on('download-progress', (progress) => {
    state.phase = 'downloading'
    state.percent = Math.round(progress.percent)
    emit()
  })

  autoUpdater.on('update-downloaded', (info) => {
    state.phase = 'ready'
    state.version = info.version
    state.percent = 100
    state.dismissed = false
    emit()
  })

  // Falha de atualização nunca vira popup: o app tem que abrir e contar cartas
  // mesmo offline ou com o GitHub fora do ar.
  autoUpdater.on('error', () => {
    state.phase = 'error'
    emit()
  })

  app.on('browser-window-focus', checkIfDue)

  firstCheck = setTimeout(check, FIRST_CHECK_DELAY_MS)
  recheck = setInterval(checkIfDue, CHECK_INTERVAL_MS)

  return {
    install: () => {
      if (state.phase !== 'ready') return
      // Silencioso (sem o assistente do NSIS) e reabrindo o app depois.
      autoUpdater.quitAndInstall(true, true)
    },
    dismiss: () => {
      state.dismissed = true
      emit()
    },
    status: () => visibleStatus(state),
    dispose: () => {
      disposed = true
      if (firstCheck !== null) clearTimeout(firstCheck)
      if (recheck !== null) clearInterval(recheck)
      firstCheck = null
      recheck = null
      app.removeListener('browser-window-focus', checkIfDue)
      autoUpdater.removeAllListeners()
    }
  }
}
