import { describe, expect, it } from 'vitest'

import { shouldPromptForUpdate } from '../src/main/updater/policy'
import type { UpdatePromptState } from '../src/main/updater/policy'

const idle: UpdatePromptState = {
  pendingVersion: null,
  dismissed: false,
  promptOpen: false,
  mainWindowFocused: false
}

describe('shouldPromptForUpdate', () => {
  it('sem atualização baixada -> não pergunta', () => {
    expect(shouldPromptForUpdate({ ...idle, mainWindowFocused: true })).toBe(false)
  })

  it('baixada com a janela principal em foco -> pergunta', () => {
    expect(
      shouldPromptForUpdate({ ...idle, pendingVersion: '0.2.0', mainWindowFocused: true })
    ).toBe(true)
  })

  /**
   * O caso que o app existe para proteger. Note que "visível" não serviria:
   * com dois monitores a janela fica à vista o jogo inteiro. Só o foco
   * distingue "ele está olhando para o Counter" de "ele está na mesa".
   */
  it('baixada sem foco (jogando) -> segura o diálogo', () => {
    expect(shouldPromptForUpdate({ ...idle, pendingVersion: '0.2.0' })).toBe(false)
  })

  it('a mesma pendência dispara quando a janela recebe foco', () => {
    const pending = { ...idle, pendingVersion: '0.2.0' }
    expect(shouldPromptForUpdate(pending)).toBe(false)
    expect(shouldPromptForUpdate({ ...pending, mainWindowFocused: true })).toBe(true)
  })

  it('depois de "Depois" não pergunta de novo', () => {
    expect(
      shouldPromptForUpdate({
        ...idle,
        pendingVersion: '0.2.0',
        mainWindowFocused: true,
        dismissed: true
      })
    ).toBe(false)
  })

  it('com o diálogo já aberto não abre um segundo', () => {
    expect(
      shouldPromptForUpdate({
        ...idle,
        pendingVersion: '0.2.0',
        mainWindowFocused: true,
        promptOpen: true
      })
    ).toBe(false)
  })
})
