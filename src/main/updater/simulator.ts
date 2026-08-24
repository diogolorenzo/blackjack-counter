import { visibleStatus } from './policy'
import type { UpdateState } from './policy'
import type { UpdateStatus } from '@shared/types'

/** Passo de progresso do download falso, em pontos percentuais. */
const STEP_PERCENT = 10
/** Intervalo entre passos: 10 passos dão ~7s de download antes do "pronta". */
const STEP_MS = 700
/** Espera antes do primeiro passo, para a pílula não nascer junto com a janela. */
const START_DELAY_MS = 1_500

/** Versão anunciada quando a env var é só um liga/desliga (`1`, `true`). */
const FAKE_VERSION = '9.9.9'

/**
 * Lê a versão a anunciar a partir da env var. Qualquer valor que não seja um
 * liga/desliga vira o texto da pílula, então `COUNTER_FAKE_UPDATE=0.5.0`
 * mostra exatamente essa versão.
 */
export function fakeVersionFrom(raw: string | undefined): string | null {
  if (raw === undefined) return null
  const value = raw.trim()
  if (value === '' || value === '0' || value.toLowerCase() === 'false') return null
  if (value === '1' || value.toLowerCase() === 'true') return FAKE_VERSION
  return value
}

export interface SimulatedUpdater {
  install(): void
  dismiss(): void
  status(): UpdateStatus | null
  dispose(): void
}

/**
 * Updater de mentira, só para desenvolvimento.
 *
 * Em `electron-vite dev` não existe app empacotado nem app-update.yml, então o
 * updater real não roda e a pílula nunca aparece — o visual dela só era
 * verificável publicando uma release de verdade. Este simulador percorre o
 * mesmo caminho de estados (baixando 0..100 -> pronta) e usa a mesma
 * `visibleStatus`, de forma que o que se vê aqui é o que o usuário vê.
 *
 * `install` não reinicia nada: em dev não há o que instalar. Ele volta ao
 * início do ciclo, o que também serve para rever a animação sem reabrir o app.
 */
export function createSimulatedUpdater(deps: {
  broadcast: (status: UpdateStatus | null) => void
  version: string
}): SimulatedUpdater {
  const state: UpdateState = {
    phase: 'idle',
    version: deps.version,
    percent: 0,
    dismissed: false,
    lastCheckAt: null
  }

  let timer: NodeJS.Timeout | null = null
  let disposed = false

  function emit(): void {
    if (disposed) return
    deps.broadcast(visibleStatus(state))
  }

  function stop(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  function step(): void {
    if (disposed) return
    state.percent = Math.min(100, state.percent + STEP_PERCENT)
    if (state.percent >= 100) {
      state.phase = 'ready'
      // Mesmo desarme do 'update-downloaded' real: dispensar o progresso não
      // pode esconder o "pronta". Sem isto, um × durante o download deixaria a
      // pílula muda justo no estado que interessa ver.
      state.dismissed = false
      emit()
      return
    }
    state.phase = 'downloading'
    emit()
    timer = setTimeout(step, STEP_MS)
  }

  function start(): void {
    stop()
    state.phase = 'downloading'
    state.percent = 0
    state.dismissed = false
    emit()
    timer = setTimeout(step, STEP_MS)
  }

  timer = setTimeout(start, START_DELAY_MS)

  return {
    install: start,
    dismiss: () => {
      state.dismissed = true
      emit()
    },
    status: () => visibleStatus(state),
    dispose: () => {
      disposed = true
      stop()
    }
  }
}
