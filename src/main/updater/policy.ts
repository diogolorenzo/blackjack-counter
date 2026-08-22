import type { UpdatePhase, UpdateStatus } from '@shared/types'

export interface UpdateState {
  phase: UpdatePhase
  /** Versão da atualização em curso; null enquanto não há nenhuma. */
  version: string | null
  /** 0..100. Só significativo em 'downloading'. */
  percent: number
  /** O usuário fechou a pílula desta pendência. */
  dismissed: boolean
  /** epoch ms da última checagem disparada. */
  lastCheckAt: number | null
}

/**
 * O que a pílula mostra. `null` = pílula escondida.
 *
 * `idle` e `checking` não são notícia, e `error` nunca vira alerta: o app tem
 * que abrir e contar cartas com o GitHub fora do ar. Isto substituiu o
 * `shouldPromptForUpdate`, que existia para decidir QUANDO interromper — uma
 * pílula passiva não interrompe, então o gate de foco deixou de fazer sentido.
 */
export function visibleStatus(state: UpdateState): UpdateStatus | null {
  if (state.dismissed) return null
  if (state.phase !== 'downloading' && state.phase !== 'ready') return null
  return { phase: state.phase, version: state.version, percent: state.percent }
}

/** Evita rechecar em rajada quando a janela ganha e perde foco várias vezes. */
export function shouldCheck(state: UpdateState, now: number, minGapMs: number): boolean {
  if (state.phase === 'downloading' || state.phase === 'ready') return false
  if (state.lastCheckAt === null) return true
  return now - state.lastCheckAt >= minGapMs
}
