import { unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { app } from 'electron'
import electronUpdater from 'electron-updater'

import { planInstall } from './install'
import { createFileLogger } from './log'
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

/**
 * Escreve e apaga um arquivo dentro da pasta do executável para saber se dá
 * para instalar por cima sem elevação.
 *
 * A pergunta é "este usuário grava aqui?", e no Windows `fs.access(W_OK)` não
 * responde isso para diretório: ele olha o atributo somente-leitura, não a ACL,
 * então diz que sim para `Program Files`. Tentar de verdade é o único teste
 * honesto.
 */
function installDirIsWritable(): boolean {
  const probe = join(dirname(app.getPath('exe')), '.counter-update-probe')
  try {
    writeFileSync(probe, '')
    unlinkSync(probe)
    return true
  } catch {
    return false
  }
}

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

  const logger = createFileLogger(join(app.getPath('userData'), 'updater.log'))
  // Sem isto o electron-updater fala no console, que num app empacotado não
  // existe. O arquivo é o que sobra para diagnosticar uma instalação que falhou.
  autoUpdater.logger = logger

  const plan = planInstall(installDirIsWritable())
  logger.info(`Versão ${app.getVersion()} em ${app.getPath('exe')}`)
  logger.info(`Plano de instalação: ${plan.reason}`)

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = plan.autoOnQuit

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
  // mesmo offline ou com o GitHub fora do ar. Fica no log, que é onde se procura
  // depois — a tela do jogador não é lugar de erro de rede.
  autoUpdater.on('error', (error) => {
    state.phase = 'error'
    logger.error(error)
    emit()
  })

  app.on('browser-window-focus', checkIfDue)

  firstCheck = setTimeout(check, FIRST_CHECK_DELAY_MS)
  recheck = setInterval(checkIfDue, CHECK_INTERVAL_MS)

  return {
    install: () => {
      if (state.phase !== 'ready') return
      logger.info(`Instalando ${state.version ?? '?'}: ${plan.reason}`)
      // Reabre o app depois em qualquer um dos dois caminhos.
      autoUpdater.quitAndInstall(plan.silent, true)
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
      // Os listeners do autoUpdater ficam: `dispose` roda no `before-quit`, e é
      // logo depois dele que a instalação no fechamento acontece. Sem o listener
      // de 'error', uma falha ali vira 'error' sem ouvinte — que no EventEmitter
      // do Node é exceção não tratada, no meio do encerramento.
    }
  }
}
