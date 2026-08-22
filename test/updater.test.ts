import { describe, expect, it } from 'vitest'

import { shouldCheck, visibleStatus } from '../src/main/updater/policy'
import type { UpdateState } from '../src/main/updater/policy'

const idle: UpdateState = {
  phase: 'idle',
  version: null,
  percent: 0,
  dismissed: false,
  lastCheckAt: null
}

describe('visibleStatus', () => {
  it('parado não mostra nada', () => {
    expect(visibleStatus(idle)).toBeNull()
  })

  /** Checagem em andamento não é notícia: a pílula só aparece quando há o quê dizer. */
  it('checando não mostra nada', () => {
    expect(visibleStatus({ ...idle, phase: 'checking' })).toBeNull()
  })

  /**
   * Falha de atualização nunca vira alerta: o app tem que abrir e contar cartas
   * com o GitHub fora do ar.
   */
  it('erro não mostra nada', () => {
    expect(visibleStatus({ ...idle, phase: 'error' })).toBeNull()
  })

  it('baixando mostra versão e progresso', () => {
    expect(
      visibleStatus({ ...idle, phase: 'downloading', version: '0.3.0', percent: 37 })
    ).toEqual({ phase: 'downloading', version: '0.3.0', percent: 37 })
  })

  it('pronta mostra a versão', () => {
    expect(visibleStatus({ ...idle, phase: 'ready', version: '0.3.0', percent: 100 })).toEqual({
      phase: 'ready',
      version: '0.3.0',
      percent: 100
    })
  })

  it('dispensada some, mesmo pronta', () => {
    expect(
      visibleStatus({ ...idle, phase: 'ready', version: '0.3.0', dismissed: true })
    ).toBeNull()
  })

  it('dispensada some também durante o download', () => {
    expect(
      visibleStatus({ ...idle, phase: 'downloading', version: '0.3.0', dismissed: true })
    ).toBeNull()
  })
})

describe('shouldCheck', () => {
  it('nunca checado -> checa', () => {
    expect(shouldCheck(idle, 1_000, 300_000)).toBe(true)
  })

  it('dentro da janela mínima -> não checa', () => {
    expect(shouldCheck({ ...idle, lastCheckAt: 1_000 }, 200_000, 300_000)).toBe(false)
  })

  it('passada a janela mínima -> checa', () => {
    expect(shouldCheck({ ...idle, lastCheckAt: 1_000 }, 400_000, 300_000)).toBe(true)
  })

  /**
   * Já baixada e pronta, checar de novo é tráfego à toa: o autoUpdater não tem
   * o que fazer com uma segunda resposta igual.
   */
  it('com atualização pronta -> não checa', () => {
    expect(shouldCheck({ ...idle, phase: 'ready', version: '0.3.0' }, 999_999, 300_000)).toBe(
      false
    )
  })

  it('baixando -> não checa', () => {
    expect(shouldCheck({ ...idle, phase: 'downloading' }, 999_999, 300_000)).toBe(false)
  })
})
