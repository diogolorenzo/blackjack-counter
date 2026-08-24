import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSimulatedUpdater, fakeVersionFrom } from '../src/main/updater/simulator'
import type { UpdateStatus } from '../src/shared/types'

describe('fakeVersionFrom', () => {
  it('sem env var não simula nada', () => {
    expect(fakeVersionFrom(undefined)).toBeNull()
  })

  /** Desligar pela env var tem que ser possível sem removê-la do script. */
  it('valores de desligado não simulam', () => {
    expect(fakeVersionFrom('')).toBeNull()
    expect(fakeVersionFrom('0')).toBeNull()
    expect(fakeVersionFrom('false')).toBeNull()
  })

  it('liga/desliga usa uma versão de fachada', () => {
    expect(fakeVersionFrom('1')).toBe('9.9.9')
    expect(fakeVersionFrom('true')).toBe('9.9.9')
  })

  it('qualquer outro valor é a versão anunciada', () => {
    expect(fakeVersionFrom('0.5.0')).toBe('0.5.0')
    expect(fakeVersionFrom(' 0.5.0 ')).toBe('0.5.0')
  })
})

describe('createSimulatedUpdater', () => {
  let broadcasts: (UpdateStatus | null)[]

  beforeEach(() => {
    vi.useFakeTimers()
    broadcasts = []
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function start() {
    return createSimulatedUpdater({
      broadcast: (status) => broadcasts.push(status),
      version: '9.9.9'
    })
  }

  /** Nascer junto com a janela esconderia a pílula atrás do próprio boot. */
  it('não anuncia nada antes do atraso inicial', () => {
    const updater = start()
    vi.advanceTimersByTime(1_000)
    expect(broadcasts).toEqual([])
    expect(updater.status()).toBeNull()
    updater.dispose()
  })

  it('percorre baixando até pronta', () => {
    const updater = start()
    vi.advanceTimersByTime(1_500)
    expect(updater.status()).toEqual({ phase: 'downloading', version: '9.9.9', percent: 0 })

    vi.advanceTimersByTime(700 * 5)
    expect(updater.status()).toEqual({ phase: 'downloading', version: '9.9.9', percent: 50 })

    vi.advanceTimersByTime(700 * 5)
    expect(updater.status()).toEqual({ phase: 'ready', version: '9.9.9', percent: 100 })
    updater.dispose()
  })

  it('dispensar esconde a pílula', () => {
    const updater = start()
    vi.advanceTimersByTime(1_500 + 700 * 10)
    updater.dismiss()
    expect(updater.status()).toBeNull()
    expect(broadcasts.at(-1)).toBeNull()
    updater.dispose()
  })

  /** Em dev não há o que instalar; reiniciar o ciclo permite rever a animação. */
  it('instalar recomeça o ciclo em vez de reiniciar o app', () => {
    const updater = start()
    vi.advanceTimersByTime(1_500 + 700 * 10)
    expect(updater.status()?.phase).toBe('ready')

    updater.install()
    expect(updater.status()).toEqual({ phase: 'downloading', version: '9.9.9', percent: 0 })
    updater.dispose()
  })

  it('descartado para de anunciar', () => {
    const updater = start()
    vi.advanceTimersByTime(1_500)
    updater.dispose()
    const antes = broadcasts.length

    vi.advanceTimersByTime(700 * 10)
    expect(broadcasts.length).toBe(antes)
  })
})
