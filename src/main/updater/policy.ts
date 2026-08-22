export interface UpdatePromptState {
  /** Versão já baixada e pronta para instalar; `null` enquanto não há nenhuma. */
  pendingVersion: string | null
  /** O usuário já respondeu "Depois" para essa pendência. */
  dismissed: boolean
  promptOpen: boolean
  mainWindowFocused: boolean
}

/**
 * Quando é aceitável interromper o usuário para oferecer o reinício.
 *
 * O foco da janela principal é a condição central: enquanto ele estiver na mesa,
 * o Counter não rouba a tela — a atualização espera, e o `autoInstallOnAppQuit`
 * garante que ela entra no próximo encerramento mesmo se ele nunca responder.
 */
export function shouldPromptForUpdate(state: UpdatePromptState): boolean {
  if (state.pendingVersion === null) return false
  if (state.dismissed || state.promptOpen) return false
  return state.mainWindowFocused
}
